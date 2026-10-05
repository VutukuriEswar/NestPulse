import React, { useEffect, useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  ActivityIndicator, Alert, Modal, TextInput, Platform,
} from 'react-native';
import { useTheme } from '../context/ThemeContext';
import { useAuth } from '../context/AuthContext';
import { connectSocket } from '../services/SocketService';
import { requestLocationPermissions, deviceStorageKey } from '../services/LocationService';
import api, { API_URL } from '../api';

const storage = Platform.OS === 'web'
  ? {
      getItemAsync: (k) => Promise.resolve(localStorage.getItem(k)),
      setItemAsync: (k, v) => Promise.resolve(localStorage.setItem(k, v)),
    }
  : require('expo-secure-store');

const COLORS = ['#7C6FFF', '#00CFA8', '#F59E0B', '#FF5260', '#3B82F6', '#EC4899', '#10B981'];
function userColor(id) {
  if (!id) return COLORS[0];
  const n = parseInt(String(id), 10) || id.charCodeAt(0);
  return COLORS[Math.abs(n) % COLORS.length];
}

function relTime(iso) {
  if (!iso) return null;
  const s = Math.floor((Date.now() - new Date(iso)) / 1000);
  if (s < 5) return 'Just now';
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  return `${Math.floor(s / 3600)}h ago`;
}

function Avatar({ name, userId, size = 44 }) {
  const color = userColor(userId);
  const initials = (name || '?').substring(0, 2).toUpperCase();
  return (
    <View style={{
      width: size, height: size, borderRadius: size / 2,
      backgroundColor: color, justifyContent: 'center', alignItems: 'center',
    }}>
      <Text style={{ color: '#fff', fontWeight: '800', fontSize: size * 0.35 }}>{initials}</Text>
    </View>
  );
}

function notifyElectronDevice(deviceId) {
  if (typeof window !== 'undefined' && window.electronBridge?.setDevice) {
    window.electronBridge.setDevice(deviceId, API_URL);
  }
}

function FamilyModal({ colors, onClose, onDone }) {
  const [mode, setMode] = useState('create');
  const [familyName, setFamilyName] = useState('');
  const [inviteCode, setInviteCode] = useState('');
  const [loading, setLoading] = useState(false);

  const submit = async () => {
    setLoading(true);
    try {
      let res;
      if (mode === 'create') {
        if (!familyName.trim()) { Alert.alert('Required', 'Enter a family name'); setLoading(false); return; }
        res = await api.post('/api/families', { name: familyName.trim() });
      } else {
        if (!inviteCode.trim()) { Alert.alert('Required', 'Enter the invite code'); setLoading(false); return; }
        res = await api.post('/api/families/join', { invite_code: inviteCode.trim() });
      }
      onDone(res.data);
    } catch (err) {
      Alert.alert('Failed', err.response?.data?.error || 'Please try again');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose}>
      <TouchableOpacity style={styles.modalBackdrop} onPress={onClose} activeOpacity={1}>
        <TouchableOpacity activeOpacity={1} style={[styles.sheet, { backgroundColor: colors.surface }]}>
          <View style={[styles.handle, { backgroundColor: colors.border }]} />
          <Text style={[styles.sheetTitle, { color: colors.textPrimary, marginBottom: 16 }]}>Family Setup</Text>
          <View style={[styles.tabBar, { backgroundColor: colors.bg, borderColor: colors.border }]}>
            {['create', 'join'].map(m => (
              <TouchableOpacity
                key={m}
                style={[styles.tabItem, mode === m && { backgroundColor: colors.accent }]}
                onPress={() => setMode(m)}
              >
                <Text style={[styles.tabText, { color: mode === m ? '#fff' : colors.textSecondary }]}>
                  {m === 'create' ? 'Create New' : 'Join with Code'}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
          {mode === 'create' ? (
            <TextInput
              style={[styles.clipInput, { color: colors.textPrimary, borderColor: colors.border, marginTop: 12 }]}
              placeholder="Family name…"
              placeholderTextColor={colors.textMuted}
              value={familyName}
              onChangeText={setFamilyName}
            />
          ) : (
            <TextInput
              style={[styles.clipInput, { color: colors.textPrimary, borderColor: colors.border, marginTop: 12, letterSpacing: 4, fontSize: 18 }]}
              placeholder="ABCD1234"
              placeholderTextColor={colors.textMuted}
              value={inviteCode}
              onChangeText={t => setInviteCode(t.toUpperCase())}
              autoCapitalize="characters"
              maxLength={8}
            />
          )}
          <TouchableOpacity
            style={[styles.submitBtn, { backgroundColor: colors.accent, marginTop: 16, opacity: loading ? 0.7 : 1 }]}
            onPress={submit}
            disabled={loading}
          >
            {loading ? <ActivityIndicator color="#fff" /> : (
              <Text style={styles.submitBtnText}>{mode === 'create' ? 'Create Family' : 'Join Family'}</Text>
            )}
          </TouchableOpacity>
        </TouchableOpacity>
      </TouchableOpacity>
    </Modal>
  );
}

function DeviceModal({ colors, onClose, onDone }) {
  const [name, setName] = useState('');
  const [loading, setLoading] = useState(false);

  const submit = async () => {
    if (!name.trim()) { Alert.alert('Required', 'Enter a device name (e.g. My Phone)'); return; }
    setLoading(true);
    try {
      await onDone(name.trim());
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose}>
      <TouchableOpacity style={styles.modalBackdrop} onPress={onClose} activeOpacity={1}>
        <TouchableOpacity activeOpacity={1} style={[styles.sheet, { backgroundColor: colors.surface }]}>
          <View style={[styles.handle, { backgroundColor: colors.border }]} />
          <Text style={[styles.sheetTitle, { color: colors.textPrimary, marginBottom: 8 }]}>Register this device</Text>
          <Text style={{ color: colors.textMuted, fontSize: 13, marginBottom: 12 }}>
            This device will share its location with the family whenever it is online.
          </Text>
          <TextInput
            style={[styles.clipInput, { color: colors.textPrimary, borderColor: colors.border }]}
            placeholder={Platform.OS === 'web' ? 'My Windows PC' : 'My Phone'}
            placeholderTextColor={colors.textMuted}
            value={name}
            onChangeText={setName}
          />
          <TouchableOpacity
            style={[styles.submitBtn, { backgroundColor: colors.accent, marginTop: 16, opacity: loading ? 0.7 : 1 }]}
            onPress={submit}
            disabled={loading}
          >
            {loading ? <ActivityIndicator color="#fff" /> : (
              <Text style={styles.submitBtnText}>Start sharing</Text>
            )}
          </TouchableOpacity>
        </TouchableOpacity>
      </TouchableOpacity>
    </Modal>
  );
}

export default function MembersScreen() {
  const { colors } = useTheme();
  const { user, token } = useAuth();
  const [families, setFamilies] = useState([]);
  const [activeFamily, setActiveFamily] = useState(null);
  const [devices, setDevices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showFamilyModal, setShowFamilyModal] = useState(false);
  const [showDeviceModal, setShowDeviceModal] = useState(false);
  const [currentDeviceId, setCurrentDeviceId] = useState(null);

  const startTracking = useCallback(async (deviceId) => {
    if (!token || !deviceId) return;
    try {
      await requestLocationPermissions(token, API_URL, String(deviceId));
      notifyElectronDevice(String(deviceId));
    } catch (err) {
      console.warn('Tracking start failed', err);
    }
  }, [token]);

  const loadDevicesFor = useCallback(async (fam) => {
    const devRes = await api.get(`/api/families/${fam.id}/devices`);
    setDevices(devRes.data);
    try {
      const stored = await storage.getItemAsync(deviceStorageKey(fam.id));
      if (stored) {
        const match = devRes.data.find(d => String(d.id) === String(stored));
        if (match) {
          setCurrentDeviceId(String(match.id));
          startTracking(String(match.id));
        } else {
          setCurrentDeviceId(null);
        }
      } else {
        setCurrentDeviceId(null);
      }
    } catch {
      setCurrentDeviceId(null);
    }
  }, [startTracking]);

  const loadAll = useCallback(async (keepFamilyId) => {
    try {
      const { data } = await api.get('/api/families');
      setFamilies(data);
      if (data.length > 0) {
        const fam = keepFamilyId
          ? (data.find(f => String(f.id) === String(keepFamilyId)) || data[0])
          : data[0];
        setActiveFamily(fam);
        await loadDevicesFor(fam);
      } else {
        setActiveFamily(null);
        setDevices([]);
      }
    } catch (err) {
      console.warn('Members load failed', err);
    } finally {
      setLoading(false);
    }
  }, [loadDevicesFor]);

  useEffect(() => { loadAll(); }, [loadAll]);

  useEffect(() => {
    if (!token || !activeFamily) return;
    const socket = connectSocket(token);
    socket.emit('join_family', { family_id: activeFamily.id });
    const onLoc = ({ device }) => {
      setDevices(prev => {
        const idx = prev.findIndex(d => String(d.id) === String(device.id));
        if (idx === -1) return [...prev, device];
        const next = [...prev];
        next[idx] = device;
        return next;
      });
    };
    socket.on('location_update', onLoc);
    return () => {
      socket.off('location_update', onLoc);
    };
  }, [token, activeFamily]);

  const selectFamily = async (f) => {
    setActiveFamily(f);
    setLoading(true);
    try {
      await loadDevicesFor(f);
    } finally {
      setLoading(false);
    }
  };

  const registerCurrentDevice = async (name) => {
    if (!activeFamily) return;
    try {
      const { data } = await api.post(`/api/families/${activeFamily.id}/devices`, {
        name,
        device_type: Platform.OS === 'web' ? 'desktop' : Platform.OS,
      });
      await storage.setItemAsync(deviceStorageKey(activeFamily.id), String(data.id));
      setCurrentDeviceId(String(data.id));
      setShowDeviceModal(false);
      await loadDevicesFor(activeFamily);
      startTracking(String(data.id));
    } catch (err) {
      Alert.alert('Failed', err.response?.data?.error || 'Could not register device');
    }
  };

  const useExistingDevice = async (deviceId) => {
    if (!activeFamily) return;
    await storage.setItemAsync(deviceStorageKey(activeFamily.id), String(deviceId));
    setCurrentDeviceId(String(deviceId));
    startTracking(String(deviceId));
  };

  const leaveFamily = async () => {
    if (!activeFamily) return;
    Alert.alert('Leave Family', `Leave "${activeFamily.name}"?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Leave', style: 'destructive', onPress: async () => {
          try {
            await api.delete(`/api/families/${activeFamily.id}/leave`);
            setActiveFamily(null);
            setDevices([]);
            setCurrentDeviceId(null);
            await loadAll();
          } catch (err) { Alert.alert('Error', err.response?.data?.error || 'Failed'); }
        }
      }
    ]);
  };

  if (loading) {
    return (
      <View style={[styles.container, styles.center, { backgroundColor: colors.bg }]}>
        <ActivityIndicator color={colors.accent} size="large" />
      </View>
    );
  }

  const myDevices = devices.filter(d => String(d.owner_user_id) === String(user?.id));
  const hasThisDevice = currentDeviceId && myDevices.some(d => String(d.id) === String(currentDeviceId));

  const devicesByMember = activeFamily?.members?.map(m => ({
    member: m,
    devices: devices.filter(d => String(d.owner_user_id) === String(m.id)),
  })) || [];

  return (
    <View style={[styles.container, { backgroundColor: colors.bg }]}>
      <View style={[styles.header, { borderBottomColor: colors.border }]}>
        <Text style={[styles.headerTitle, { color: colors.textPrimary }]}>Family</Text>
        <TouchableOpacity
          style={[styles.addBtn, { backgroundColor: colors.accent }]}
          onPress={() => setShowFamilyModal(true)}
        >
          <Text style={styles.addBtnText}>+ Add</Text>
        </TouchableOpacity>
      </View>

      {families.length > 0 && (
        <ScrollView
          horizontal showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.familyTabsRow}
        >
          {families.map(f => {
            const active = String(f.id) === String(activeFamily?.id);
            return (
              <TouchableOpacity
                key={f.id}
                style={[
                  styles.familyTab,
                  {
                    backgroundColor: active ? colors.accent : colors.surface,
                    borderColor: active ? colors.accent : colors.border,
                  }
                ]}
                onPress={() => selectFamily(f)}
              >
                <Text style={[styles.familyTabText, { color: active ? '#fff' : colors.textSecondary }]}>
                  {f.name}
                </Text>
                <Text style={[styles.familyTabCount, { color: active ? '#ffffff99' : colors.textMuted }]}>
                  {f.members?.length || 0}
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      )}

      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        {families.length === 0 ? (
          <View style={styles.emptyState}>
            <Text style={styles.emptyEmoji}>🏡</Text>
            <Text style={[styles.emptyTitle, { color: colors.textPrimary }]}>No families yet</Text>
            <Text style={[styles.emptySubtitle, { color: colors.textSecondary }]}>
              Create a family or join one with an invite code.
            </Text>
            <TouchableOpacity
              style={[styles.submitBtn, { backgroundColor: colors.accent, marginTop: 20 }]}
              onPress={() => setShowFamilyModal(true)}
            >
              <Text style={styles.submitBtnText}>Get Started</Text>
            </TouchableOpacity>
          </View>
        ) : activeFamily ? (
          <>
            <View style={[styles.inviteCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <View>
                <Text style={[styles.inviteLabel, { color: colors.textMuted }]}>INVITE CODE</Text>
                <Text style={[styles.inviteCode, { color: colors.accent }]}>{activeFamily.invite_code}</Text>
              </View>
              <TouchableOpacity
                style={[styles.leaveBtn, { borderColor: colors.danger }]}
                onPress={leaveFamily}
              >
                <Text style={[styles.leaveBtnText, { color: colors.danger }]}>Leave</Text>
              </TouchableOpacity>
            </View>

            {!hasThisDevice ? (
              <TouchableOpacity
                style={[styles.shareBanner, { backgroundColor: colors.accent }]}
                onPress={() => setShowDeviceModal(true)}
              >
                <Text style={styles.shareBannerText}>📍 Register this device to share location</Text>
              </TouchableOpacity>
            ) : (
              <View style={[styles.sharingRow, { backgroundColor: `${colors.accent}15`, borderColor: colors.border }]}>
                <Text style={[styles.sharingText, { color: colors.textSecondary }]}>
                  ● Sharing as {myDevices.find(d => String(d.id) === String(currentDeviceId))?.name || 'this device'}
                </Text>
              </View>
            )}

            {devicesByMember.map(({ member, devices: memberDevices }) => {
              const isOnline = memberDevices.some(d => d.last_seen_at && (Date.now() - new Date(d.last_seen_at)) < 5 * 60 * 1000);
              const isMe = String(member.id) === String(user?.id);
              return (
                <View key={member.id} style={[styles.memberCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                  <View style={styles.memberHeader}>
                    <View style={{ position: 'relative' }}>
                      <Avatar name={member.name} userId={member.id} size={46} />
                      <View style={[
                        styles.statusDot,
                        { backgroundColor: isOnline ? '#10B981' : colors.textMuted, borderColor: colors.surface }
                      ]} />
                    </View>
                    <View style={{ flex: 1, marginLeft: 12 }}>
                      <View style={styles.memberNameRow}>
                        <Text style={[styles.memberName, { color: colors.textPrimary }]}>{member.name}</Text>
                        {isMe && (
                          <View style={[styles.meBadge, { backgroundColor: `${colors.accent}22` }]}>
                            <Text style={[styles.meBadgeText, { color: colors.accent }]}>You</Text>
                          </View>
                        )}
                      </View>
                      <Text style={[styles.memberStatus, { color: isOnline ? '#10B981' : colors.textMuted }]}>
                        {isOnline ? '● Online' : memberDevices.length > 0 && memberDevices[0].last_seen_at ? `Last seen ${relTime(memberDevices[0].last_seen_at)}` : '○ Offline'}
                      </Text>
                    </View>
                  </View>

                  {memberDevices.length > 0 && (
                    <View>
                      {memberDevices.map(d => {
                        const t = (d.device_type || '').toLowerCase();
                        const emoji = t.includes('desktop') ? '🖥️' : t.includes('tablet') ? '📟' : t.includes('laptop') ? '💻' : '📱';
                        const isCurrent = String(d.id) === String(currentDeviceId);
                        return (
                          <View key={d.id} style={[styles.deviceRow, { borderTopColor: colors.border }]}>
                            <Text style={styles.deviceEmoji}>{emoji}</Text>
                            <View style={{ flex: 1 }}>
                              <Text style={[styles.deviceName, { color: colors.textPrimary }]}>{d.name}</Text>
                              <Text style={[styles.deviceMeta, { color: colors.textMuted }]}>
                                {d.last_seen_at ? relTime(d.last_seen_at) : 'No location yet'}
                              </Text>
                            </View>
                            {isMe && !isCurrent && (
                              <TouchableOpacity
                                style={[styles.useBtn, { borderColor: colors.accent }]}
                                onPress={() => useExistingDevice(d.id)}
                              >
                                <Text style={[styles.useBtnText, { color: colors.accent }]}>Use</Text>
                              </TouchableOpacity>
                            )}
                            {isCurrent && (
                              <View style={[styles.thisDeviceBadge, { backgroundColor: colors.surfaceHover || colors.border }]}>
                                <Text style={[styles.thisDeviceText, { color: colors.textMuted }]}>THIS</Text>
                              </View>
                            )}
                          </View>
                        );
                      })}
                    </View>
                  )}

                  {memberDevices.length === 0 && (
                    <Text style={[styles.noDeviceText, { color: colors.textMuted }]}>No devices registered</Text>
                  )}
                </View>
              );
            })}
          </>
        ) : null}
      </ScrollView>

      {showFamilyModal && (
        <FamilyModal
          colors={colors}
          onClose={() => setShowFamilyModal(false)}
          onDone={(fam) => {
            setShowFamilyModal(false);
            loadAll(String(fam.id));
          }}
        />
      )}

      {showDeviceModal && (
        <DeviceModal
          colors={colors}
          onClose={() => setShowDeviceModal(false)}
          onDone={registerCurrentDevice}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  center: { justifyContent: 'center', alignItems: 'center' },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 20, paddingTop: 56, paddingBottom: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  headerTitle: { fontSize: 28, fontWeight: '900', letterSpacing: -0.5 },
  addBtn: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 100 },
  addBtnText: { color: '#fff', fontWeight: '700', fontSize: 13 },

  familyTabsRow: { paddingHorizontal: 16, paddingVertical: 12, gap: 8 },
  familyTab: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: 14, paddingVertical: 8, borderRadius: 100, borderWidth: 1,
  },
  familyTabText: { fontSize: 13, fontWeight: '700' },
  familyTabCount: { fontSize: 12, fontWeight: '500' },

  scrollContent: { padding: 16, paddingBottom: 100, gap: 12 },

  inviteCard: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    padding: 16, borderRadius: 16, borderWidth: StyleSheet.hairlineWidth,
  },
  inviteLabel: { fontSize: 11, fontWeight: '700', letterSpacing: 0.8, marginBottom: 4 },
  inviteCode: { fontSize: 22, fontWeight: '900', letterSpacing: 4 },
  leaveBtn: { paddingHorizontal: 14, paddingVertical: 7, borderRadius: 10, borderWidth: 1.5 },
  leaveBtnText: { fontWeight: '700', fontSize: 13 },

  shareBanner: { borderRadius: 14, padding: 14, alignItems: 'center' },
  shareBannerText: { color: '#fff', fontWeight: '700', fontSize: 14 },
  sharingRow: { borderRadius: 12, padding: 12, borderWidth: StyleSheet.hairlineWidth, alignItems: 'center' },
  sharingText: { fontSize: 13, fontWeight: '600' },

  memberCard: { borderRadius: 18, borderWidth: StyleSheet.hairlineWidth, overflow: 'hidden' },
  memberHeader: { flexDirection: 'row', alignItems: 'center', padding: 16 },
  statusDot: {
    position: 'absolute', bottom: 0, right: 0,
    width: 13, height: 13, borderRadius: 6.5, borderWidth: 2,
  },
  memberNameRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 2 },
  memberName: { fontSize: 16, fontWeight: '700' },
  meBadge: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 100 },
  meBadgeText: { fontSize: 11, fontWeight: '700' },
  memberStatus: { fontSize: 12, fontWeight: '500' },

  deviceRow: {
    flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12,
    borderTopWidth: StyleSheet.hairlineWidth, gap: 10,
  },
  deviceEmoji: { fontSize: 22, width: 32, textAlign: 'center' },
  deviceName: { fontSize: 14, fontWeight: '600', marginBottom: 2 },
  deviceMeta: { fontSize: 12 },

  useBtn: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 10, borderWidth: 1.5 },
  useBtnText: { fontSize: 12, fontWeight: '700' },
  thisDeviceBadge: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 8 },
  thisDeviceText: { fontSize: 10, fontWeight: '800', letterSpacing: 0.5 },
  noDeviceText: { fontSize: 13, paddingHorizontal: 16, paddingBottom: 14 },

  emptyState: { alignItems: 'center', paddingVertical: 60 },
  emptyEmoji: { fontSize: 52, marginBottom: 12 },
  emptyTitle: { fontSize: 20, fontWeight: '700', marginBottom: 6 },
  emptySubtitle: { fontSize: 14, textAlign: 'center', paddingHorizontal: 32 },

  modalBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  sheet: { borderRadius: 28, padding: 24, paddingBottom: 40 },
  handle: { width: 40, height: 4, borderRadius: 2, alignSelf: 'center', marginBottom: 20 },
  sheetTitle: { fontSize: 20, fontWeight: '800' },
  clipInput: { height: 52, borderRadius: 14, paddingHorizontal: 16, fontSize: 15, borderWidth: 1.5 },
  tabBar: { flexDirection: 'row', borderRadius: 14, padding: 4, borderWidth: 1, marginBottom: 4 },
  tabItem: { flex: 1, paddingVertical: 10, borderRadius: 10, alignItems: 'center' },
  tabText: { fontSize: 13, fontWeight: '700' },
  submitBtn: { height: 50, borderRadius: 14, justifyContent: 'center', alignItems: 'center' },
  submitBtnText: { color: '#fff', fontWeight: '700', fontSize: 16 },
});
