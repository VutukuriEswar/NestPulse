import os
import secrets
import string
from datetime import datetime, timedelta, timezone

from bson import ObjectId
from bson.errors import InvalidId
from dotenv import load_dotenv
from flask import Flask, jsonify, request
from flask_cors import CORS
from flask_jwt_extended import (
    JWTManager,
    create_access_token,
    create_refresh_token,
    decode_token,
    get_jwt_identity,
    jwt_required,
)
from flask_socketio import SocketIO, join_room
from pymongo import MongoClient
from pymongo.errors import DuplicateKeyError, ServerSelectionTimeoutError
from werkzeug.security import check_password_hash, generate_password_hash

load_dotenv()

app = Flask(__name__)
app.config["JWT_SECRET_KEY"] = os.environ.get("JWT_SECRET_KEY", "dev-jwt-secret-change-me")
app.config["JWT_ACCESS_TOKEN_EXPIRES"] = timedelta(hours=int(os.environ.get("JWT_ACCESS_HOURS", "12")))
app.config["JWT_REFRESH_TOKEN_EXPIRES"] = timedelta(days=30)

jwt = JWTManager(app)
CORS(app, origins="*", allow_headers=["*"])
socketio = SocketIO(app, cors_allowed_origins="*", async_mode="threading", manage_session=False)

MONGO_URI = os.environ.get("MONGO_URI", "mongodb://localhost:27017/nestpulse")
MONGO_DB_NAME = os.environ.get("MONGO_DB_NAME", "nestpulse")

mongo_client = MongoClient(MONGO_URI, serverSelectionTimeoutMS=5000)
db = mongo_client[MONGO_DB_NAME]
users_col = db["users"]
families_col = db["families"]
devices_col = db["devices"]

try:
    mongo_client.admin.command("ping")
except ServerSelectionTimeoutError as e:
    raise RuntimeError(
        f"Cannot reach MongoDB at {MONGO_URI}. Is mongod running? "
        "Set MONGO_URI in backend/.env if it lives elsewhere."
    ) from e

users_col.create_index("email", unique=True)
families_col.create_index("invite_code", unique=True)
devices_col.create_index([("family_id", 1), ("name", 1)])


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _oid(id_str) -> ObjectId | None:
    try:
        return ObjectId(str(id_str))
    except (InvalidId, TypeError):
        return None


def _serialize(doc: dict) -> dict:
    doc = dict(doc)
    doc["id"] = str(doc.pop("_id"))
    return doc


def get_user(user_id) -> dict | None:
    oid = _oid(user_id)
    if oid is None:
        return None
    doc = users_col.find_one({"_id": oid})
    return _serialize(doc) if doc else None


def get_family(family_id) -> dict | None:
    oid = _oid(family_id)
    if oid is None:
        return None
    doc = families_col.find_one({"_id": oid})
    return _serialize(doc) if doc else None


def get_device(device_id) -> dict | None:
    oid = _oid(device_id)
    if oid is None:
        return None
    doc = devices_col.find_one({"_id": oid})
    return _serialize(doc) if doc else None


def user_to_public(u: dict) -> dict:
    return {"id": u["id"], "name": u["name"], "email": u["email"]}


def device_to_dict(d: dict) -> dict:
    owner = get_user(d["owner_user_id"])
    return {
        "id": d["id"],
        "name": d["name"],
        "device_type": d.get("device_type", "phone"),
        "owner_user_id": d["owner_user_id"],
        "owner_name": owner["name"] if owner else None,
        "last_lat": d.get("last_lat"),
        "last_lng": d.get("last_lng"),
        "last_seen_at": d.get("last_seen_at"),
    }


def family_to_dict(f: dict, include_invite: bool = False) -> dict:
    oids = [oid for uid in f.get("member_ids", []) if (oid := _oid(uid)) is not None]
    members_by_id = {}
    if oids:
        for doc in users_col.find({"_id": {"$in": oids}}):
            s = _serialize(doc)
            members_by_id[s["id"]] = user_to_public(s)
    members = [members_by_id[uid] for uid in f.get("member_ids", []) if uid in members_by_id]
    creator_id = f.get("creator_id") or (f["member_ids"][0] if f.get("member_ids") else None)
    result = {"id": f["id"], "name": f["name"], "members": members, "creator_id": creator_id}
    if include_invite:
        result["invite_code"] = f["invite_code"]
    return result


def generate_invite_code() -> str:
    alphabet = string.ascii_uppercase + string.digits
    return "".join(secrets.choice(alphabet) for _ in range(8))


def current_user() -> dict | None:
    uid = get_jwt_identity()
    return get_user(uid) if uid else None


def _user_in_family(user: dict, family_id: str) -> bool:
    return str(family_id) in [str(f) for f in user.get("family_ids", [])]


@app.post("/api/auth/register")
def register():
    data = request.get_json(silent=True) or {}
    name = (data.get("name") or "").strip()
    email = (data.get("email") or "").strip().lower()
    password = data.get("password") or ""

    if not name or not email or len(password) < 6:
        return jsonify({"error": "name, email, and a password of 6+ characters are required"}), 400

    if users_col.find_one({"email": email}):
        return jsonify({"error": "An account with that email already exists"}), 409

    try:
        result = users_col.insert_one({
            "name": name,
            "email": email,
            "password_hash": generate_password_hash(password),
            "family_ids": [],
            "created_at": _now_iso(),
        })
    except DuplicateKeyError:
        return jsonify({"error": "An account with that email already exists"}), 409

    user = _serialize(users_col.find_one({"_id": result.inserted_id}))
    uid = user["id"]
    access_token = create_access_token(identity=uid)
    refresh_token = create_refresh_token(identity=uid)
    return jsonify({
        "access_token": access_token,
        "refresh_token": refresh_token,
        "user": user_to_public(user),
    }), 201


@app.route("/api/auth/login", methods=["POST"])
def login():
    try:
        data = request.get_json()
        if not data or "email" not in data or "password" not in data:
            return jsonify({"error": "Missing email or password"}), 400

        doc = users_col.find_one({"email": data["email"].lower()})
        user = _serialize(doc) if doc else None

        if not user or not check_password_hash(user["password_hash"], data["password"]):
            return jsonify({"error": "Invalid email or password"}), 401

        access_token = create_access_token(identity=user["id"])
        refresh_token = create_refresh_token(identity=user["id"])

        return jsonify({
            "access_token": access_token,
            "refresh_token": refresh_token,
            "user": user_to_public(user)
        })
    except Exception:
        return jsonify({"error": "Internal server error"}), 500


@app.post("/api/auth/refresh")
@jwt_required(refresh=True)
def token_refresh():
    uid = get_jwt_identity()
    return jsonify({"access_token": create_access_token(identity=uid)})


@app.get("/api/auth/me")
@jwt_required()
def me():
    user = current_user()
    if not user:
        return jsonify({"error": "User not found"}), 404
    return jsonify(user_to_public(user))


@app.get("/api/families")
@jwt_required()
def list_families():
    user = current_user()
    result = []
    for fid in user.get("family_ids", []):
        f = get_family(fid)
        if f:
            result.append(family_to_dict(f, include_invite=True))
    return jsonify(result)


@app.post("/api/families")
@jwt_required()
def create_family():
    user = current_user()
    data = request.get_json(silent=True) or {}
    name = (data.get("name") or "").strip()
    if not name:
        return jsonify({"error": "Family name is required"}), 400

    family = None
    for _ in range(5):
        try:
            result = families_col.insert_one({
                "name": name,
                "invite_code": generate_invite_code(),
                "creator_id": user["id"],
                "member_ids": [user["id"]],
                "created_at": _now_iso(),
            })
            family = _serialize(families_col.find_one({"_id": result.inserted_id}))
            break
        except DuplicateKeyError:
            continue
    if family is None:
        return jsonify({"error": "Could not generate a unique invite code, please retry"}), 500

    fid = family["id"]
    users_col.update_one({"_id": _oid(user["id"])}, {"$addToSet": {"family_ids": fid}})

    return jsonify(family_to_dict(family, include_invite=True)), 201


@app.post("/api/families/join")
@jwt_required()
def join_family():
    user = current_user()
    data = request.get_json(silent=True) or {}
    invite_code = (data.get("invite_code") or "").strip().upper()
    if not invite_code:
        return jsonify({"error": "invite_code is required"}), 400

    doc = families_col.find_one({"invite_code": invite_code})
    if not doc:
        return jsonify({"error": "Invite code not found"}), 404
    family = _serialize(doc)

    fid = family["id"]
    uid = user["id"]

    families_col.update_one({"_id": _oid(fid)}, {"$addToSet": {"member_ids": uid}})
    users_col.update_one({"_id": _oid(uid)}, {"$addToSet": {"family_ids": fid}})

    return jsonify(family_to_dict(get_family(fid), include_invite=True))


@app.get("/api/families/<family_id>")
@jwt_required()
def get_single_family(family_id):
    user = current_user()
    if str(family_id) not in [str(f) for f in user.get("family_ids", [])]:
        return jsonify({"error": "Not a member of this family"}), 403
    family = get_family(family_id)
    if not family:
        return jsonify({"error": "Family not found"}), 404
    return jsonify(family_to_dict(family, include_invite=True))


@app.delete("/api/families/<family_id>/leave")
@jwt_required()
def leave_family(family_id):
    user = current_user()
    uid = user["id"]
    fid = str(family_id)

    users_col.update_one({"_id": _oid(uid)}, {"$pull": {"family_ids": fid}})
    families_col.update_one({"_id": _oid(fid)}, {"$pull": {"member_ids": uid}})

    return jsonify({"status": "left"})


@app.post("/api/families/<family_id>/devices")
@jwt_required()
def register_device(family_id):
    user = current_user()
    if not _user_in_family(user, family_id):
        return jsonify({"error": "Not a member of this family"}), 403

    data = request.get_json(silent=True) or {}
    name = (data.get("name") or "").strip()
    device_type = (data.get("device_type") or "phone").strip()
    if not name:
        return jsonify({"error": "Device name is required"}), 400

    fid = next((str(f) for f in user.get("family_ids", []) if str(f) == str(family_id)), str(family_id))
    if not get_family(fid):
        return jsonify({"error": "Family not found"}), 404
    for d in devices_col.find({"family_id": fid}):
        if d["name"].lower() == name.lower():
            return jsonify({"error": f"A device named '{name}' already exists in this family."}), 400

    result = devices_col.insert_one({
        "name": name,
        "device_type": device_type,
        "owner_user_id": user["id"],
        "family_id": fid,
        "last_lat": None,
        "last_lng": None,
        "last_seen_at": None,
        "created_at": _now_iso(),
    })
    return jsonify(device_to_dict(get_device(result.inserted_id))), 201


@app.get("/api/families/<family_id>/devices")
@jwt_required()
def list_devices(family_id):
    user = current_user()
    if not _user_in_family(user, family_id):
        return jsonify({"error": "Not a member of this family"}), 403
    family = get_family(family_id)
    if not family:
        return jsonify({"error": "Family not found"}), 404
    family_devices = [_serialize(d) for d in devices_col.find({"family_id": family["id"]})]
    return jsonify([device_to_dict(d) for d in family_devices])


@app.post("/api/devices/<device_id>/location")
@jwt_required()
def post_location(device_id):
    user = current_user()
    device = get_device(device_id)
    if not device:
        return jsonify({"error": "Device not found"}), 404
    if str(device["owner_user_id"]) != str(user["id"]):
        return jsonify({"error": "Only the device owner can update its location"}), 403
    if not _user_in_family(user, device["family_id"]):
        return jsonify({"error": "Not a member of this family"}), 403

    data = request.get_json(silent=True) or {}
    try:
        lat = float(data["lat"])
        lng = float(data["lng"])
    except (KeyError, TypeError, ValueError):
        return jsonify({"error": "lat and lng (numbers) are required"}), 400

    if not (-90 <= lat <= 90 and -180 <= lng <= 180):
        return jsonify({"error": "lat must be -90..90 and lng -180..180"}), 400

    now = _now_iso()
    devices_col.update_one(
        {"_id": _oid(device["id"])},
        {"$set": {"last_lat": lat, "last_lng": lng, "last_seen_at": now}},
    )

    d_out = device_to_dict(get_device(device["id"]))
    socketio.emit("location_update", {"device": d_out}, room=f"family-{device['family_id']}")
    return jsonify(d_out)


_authenticated_sids: dict = {}


@socketio.on("connect")
def handle_connect(auth):
    token = (auth or {}).get("token", "")
    if not token:
        return False
    try:
        decoded = decode_token(token)
        uid = decoded["sub"]
        from flask_socketio import request as ws_req
        _authenticated_sids[ws_req.sid] = uid
        return True
    except Exception:
        return False


@socketio.on("disconnect")
def handle_disconnect():
    from flask_socketio import request as ws_req
    _authenticated_sids.pop(ws_req.sid, None)


@socketio.on("join_family")
def handle_join_family(data):
    from flask_socketio import request as ws_req
    uid = _authenticated_sids.get(ws_req.sid)
    if not uid:
        return
    user = get_user(uid)
    if not user:
        return
    requested_fid = str((data or {}).get("family_id", ""))
    if requested_fid and _user_in_family(user, requested_fid):
        join_room(f"family-{requested_fid}")


@app.get("/api/health")
def health():
    return jsonify({"status": "ok", "service": "NestPulse"})


@app.errorhandler(404)
def not_found(_e):
    return jsonify({"error": "Not found"}), 404


@app.errorhandler(500)
def server_error(_e):
    return jsonify({"error": "Internal server error"}), 500


if __name__ == "__main__":
    port = int(os.environ.get("PORT", "5000"))
    debug = os.environ.get("FLASK_DEBUG", "true").lower() == "true"
    socketio.run(app, host="0.0.0.0", port=port, debug=debug, allow_unsafe_werkzeug=True)
