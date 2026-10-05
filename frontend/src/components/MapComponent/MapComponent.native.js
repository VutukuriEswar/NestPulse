import React, { forwardRef, useImperativeHandle, useRef } from 'react';
import { View, Text, StyleSheet, Dimensions } from 'react-native';
import MapView, { Marker, Callout, PROVIDER_GOOGLE } from 'react-native-maps';

const { width, height } = Dimensions.get('window');
const ASPECT_RATIO = width / height;
const DELTA = { latitudeDelta: 0.05, longitudeDelta: 0.05 * ASPECT_RATIO };

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

const MapComponent = forwardRef(({ devices, theme, colors }, ref) => {
  const mapRef = useRef(null);

  useImperativeHandle(ref, () => ({
    fitToMarkers: () => {
      const valid = devices.filter(d => d.last_lat && d.last_lng);
      if (valid.length === 0) return;
      if (valid.length === 1) {
        mapRef.current?.animateToRegion({
          latitude: valid[0].last_lat,
          longitude: valid[0].last_lng,
          ...DELTA,
        }, 600);
        return;
      }
      mapRef.current?.fitToCoordinates(
        valid.map(d => ({ latitude: d.last_lat, longitude: d.last_lng })),
        { edgePadding: { top: 80, right: 60, bottom: 80, left: 60 }, animated: true }
      );
    }
  }));

  const validDevices = devices.filter(d => d.last_lat && d.last_lng);

  return (
    <MapView
      ref={mapRef}
      style={styles.map}
      provider={PROVIDER_GOOGLE}
      userInterfaceStyle={theme}
      showsUserLocation
      showsMyLocationButton={false}
      initialRegion={{
        latitude: validDevices[0]?.last_lat || 37.78825,
        longitude: validDevices[0]?.last_lng || -122.4324,
        ...DELTA,
      }}
    >
      {validDevices.map(device => {
        const isOnline = device.last_seen_at && (Date.now() - new Date(device.last_seen_at)) < 5 * 60 * 1000;
        const color = userColor(device.owner_user_id);
        return (
          <Marker
            key={device.id}
            coordinate={{ latitude: device.last_lat, longitude: device.last_lng }}
            anchor={{ x: 0.5, y: 0.5 }}
          >
            <View style={styles.markerWrapper}>
              <View style={[styles.markerBubble, { backgroundColor: color }]}>
                <Text style={styles.markerInitials}>
                  {(device.owner_name || device.name || '?').substring(0, 2).toUpperCase()}
                </Text>
              </View>
              {isOnline && <View style={[styles.markerDot, { borderColor: colors.bg }]} />}
            </View>
            <Callout style={[styles.callout, { backgroundColor: colors.surface }]}>
              <Text style={[styles.calloutName, { color: colors.textPrimary }]}>{device.name}</Text>
              <Text style={[styles.calloutOwner, { color: colors.textSecondary }]}>{device.owner_name}</Text>
              <Text style={[styles.calloutDetail, { color: isOnline ? '#10B981' : colors.textMuted }]}>
                {isOnline ? '● Live' : `${relTime(device.last_seen_at) || 'Never'}`}
              </Text>
            </Callout>
          </Marker>
        );
      })}
    </MapView>
  );
});

const styles = StyleSheet.create({
  map: { width: '100%', height: '100%' },
  markerWrapper: { alignItems: 'center', justifyContent: 'center' },
  markerBubble: {
    width: 44, height: 44, borderRadius: 22,
    justifyContent: 'center', alignItems: 'center',
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.3, shadowRadius: 4, elevation: 4,
    borderWidth: 2.5, borderColor: '#fff',
  },
  markerInitials: { color: '#fff', fontWeight: '800', fontSize: 14 },
  markerDot: {
    position: 'absolute', bottom: -1, right: -1,
    width: 14, height: 14, borderRadius: 7,
    backgroundColor: '#10B981', borderWidth: 2,
  },
  callout: { padding: 12, borderRadius: 12, minWidth: 130 },
  calloutName: { fontSize: 14, fontWeight: '700', marginBottom: 2 },
  calloutOwner: { fontSize: 12, marginBottom: 4 },
  calloutDetail: { fontSize: 12, marginTop: 2 },
});

export default MapComponent;
