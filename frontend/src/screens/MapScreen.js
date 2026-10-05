import React, { useEffect, useState, useRef, useCallback } from 'react';
import {
  View, Text, StyleSheet, ActivityIndicator, TouchableOpacity, ScrollView,
} from 'react-native';
import MapComponent from '../components/MapComponent';
import { useTheme } from '../context/ThemeContext';
import { useAuth } from '../context/AuthContext';
import { connectSocket } from '../services/SocketService';
import api from '../api';

export default function MapScreen() {
  const { colors, theme } = useTheme();
  const { token } = useAuth();

  const [families, setFamilies] = useState([]);
  const [activeFamily, setActiveFamily] = useState(null);
  const [devices, setDevices] = useState([]);
  const [loading, setLoading] = useState(true);
  const mapRef = useRef(null);
  const socketRef = useRef(null);

  const loadDevices = useCallback(async (familyId) => {
    try {
      const { data } = await api.get(`/api/families/${familyId}/devices`);
      setDevices(data);
    } catch (err) {
      console.warn('Failed to load devices', err);
    }
  }, []);

  const connectToFamily = useCallback((family) => {
    if (socketRef.current) {
      socketRef.current.off('location_update');
    }
    const socket = connectSocket(token);
    socket.emit('join_family', { family_id: family.id });

    socket.on('location_update', ({ device }) => {
      setDevices(prev => {
        const idx = prev.findIndex(d => String(d.id) === String(device.id));
        if (idx === -1) return [...prev, device];
        const next = [...prev];
        next[idx] = device;
        return next;
      });
    });

    socketRef.current = socket;
  }, [token]);

  const loadFamilies = useCallback(async () => {
    try {
      const { data } = await api.get('/api/families');
      setFamilies(data);
      if (data.length > 0) {
        const fam = activeFamily
          ? (data.find(f => String(f.id) === String(activeFamily.id)) || data[0])
          : data[0];
        setActiveFamily(fam);
        await loadDevices(fam.id);
        connectToFamily(fam);
      } else {
        setActiveFamily(null);
        setDevices([]);
      }
    } catch (err) {
      console.warn('Failed to load families', err);
    } finally {
      setLoading(false);
    }
  }, [loadDevices, connectToFamily, activeFamily]);

  useEffect(() => {
    loadFamilies();
    return () => {
      if (socketRef.current) {
        socketRef.current.off('location_update');
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const selectFamily = async (f) => {
    setActiveFamily(f);
    await loadDevices(f.id);
    connectToFamily(f);
  };

  const fitToMarkers = () => {
    try {
      mapRef.current?.fitToMarkers?.();
    } catch {}
  };

  if (loading) {
    return (
      <View style={[styles.center, { backgroundColor: colors.bg }]}>
        <ActivityIndicator size="large" color={colors.accent} />
        <Text style={[styles.loadingText, { color: colors.textMuted }]}>Loading map…</Text>
      </View>
    );
  }

  if (families.length === 0) {
    return (
      <View style={[styles.center, { backgroundColor: colors.bg }]}>
        <Text style={styles.emptyEmoji}>🏡</Text>
        <Text style={[styles.emptyTitle, { color: colors.textPrimary }]}>No family yet</Text>
        <Text style={[styles.emptySubtitle, { color: colors.textSecondary }]}>
          Go to Families to create or join one, then register this device.
        </Text>
      </View>
    );
  }

  const validDevices = devices.filter(d => d.last_lat != null && d.last_lng != null);

  return (
    <View style={styles.container}>
      <View style={StyleSheet.absoluteFillObject}>
        <MapComponent
          ref={mapRef}
          devices={devices}
          theme={theme}
          colors={colors}
        />
      </View>

      {families.length > 1 && (
        <ScrollView
          horizontal showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.familySelector}
        >
          {families.map(f => {
            const active = String(f.id) === String(activeFamily?.id);
            return (
              <TouchableOpacity
                key={f.id}
                style={[
                  styles.familyChip,
                  {
                    backgroundColor: active ? colors.accent : colors.surface,
                    borderColor: active ? colors.accent : colors.border,
                  }
                ]}
                onPress={() => selectFamily(f)}
              >
                <Text style={[styles.familyChipText, { color: active ? '#fff' : colors.textSecondary }]}>
                  {f.name}
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      )}

      {validDevices.length > 0 && (
        <TouchableOpacity
          style={[styles.fitBtn, { backgroundColor: colors.accent }]}
          onPress={fitToMarkers}
          activeOpacity={0.85}
        >
          <Text style={styles.fitBtnText}>⊕ Fit All</Text>
        </TouchableOpacity>
      )}

      {validDevices.length === 0 && (
        <View style={[styles.noLocationOverlay, { backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1 }]}>
          <Text style={styles.noLocEmoji}>📍</Text>
          <Text style={[styles.noLocText, { color: colors.textSecondary }]}>
            No locations yet — register this device in Families.
          </Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: 12, paddingHorizontal: 32 },
  loadingText: { fontSize: 14, fontWeight: '500', marginTop: 8 },
  emptyEmoji: { fontSize: 52, marginBottom: 8 },
  emptyTitle: { fontSize: 20, fontWeight: '700' },
  emptySubtitle: { fontSize: 14, textAlign: 'center', paddingHorizontal: 32, marginTop: 6 },

  familySelector: {
    position: 'absolute', top: 60, left: 16, right: 16,
    flexDirection: 'row', gap: 8, paddingRight: 32,
  },
  familyChip: {
    paddingHorizontal: 14, paddingVertical: 7, borderRadius: 100, borderWidth: 1,
  },
  familyChipText: { fontSize: 13, fontWeight: '600' },

  fitBtn: {
    position: 'absolute', bottom: 110, right: 16,
    paddingHorizontal: 16, paddingVertical: 10, borderRadius: 100,
    shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.25, shadowRadius: 8, elevation: 6,
  },
  fitBtnText: { color: '#fff', fontSize: 13, fontWeight: '700' },

  noLocationOverlay: {
    position: 'absolute', bottom: 110, left: 16, right: 16,
    borderRadius: 16, padding: 16, alignItems: 'center', flexDirection: 'row', gap: 10,
  },
  noLocEmoji: { fontSize: 22 },
  noLocText: { fontSize: 14, fontWeight: '500' },
});
