import React, { useEffect, useRef } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, Animated, Dimensions, Image,
} from 'react-native';
import { useTheme } from '../context/ThemeContext';
import { MapPin } from 'lucide-react-native';

const { width } = Dimensions.get('window');

export default function LandingScreen({ navigation }) {
  const { colors } = useTheme();

  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(40)).current;
  const orb1 = useRef(new Animated.Value(0)).current;
  const orb2 = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(fadeAnim, { toValue: 1, duration: 800, useNativeDriver: true }),
      Animated.timing(slideAnim, { toValue: 0, duration: 800, useNativeDriver: true }),
    ]).start();

    Animated.loop(
      Animated.sequence([
        Animated.timing(orb1, { toValue: 1, duration: 3000, useNativeDriver: true }),
        Animated.timing(orb1, { toValue: 0, duration: 3000, useNativeDriver: true }),
      ])
    ).start();

    Animated.loop(
      Animated.sequence([
        Animated.timing(orb2, { toValue: 1, duration: 2500, useNativeDriver: true }),
        Animated.timing(orb2, { toValue: 0, duration: 2500, useNativeDriver: true }),
      ])
    ).start();
  }, []);

  const orb1Y = orb1.interpolate({ inputRange: [0, 1], outputRange: [0, -20] });
  const orb2Y = orb2.interpolate({ inputRange: [0, 1], outputRange: [0, 16] });

  return (
    <View style={[styles.container, { backgroundColor: colors.bg }]}>
      {/* Background orbs */}
      <Animated.View style={[styles.orb, styles.orb1, { transform: [{ translateY: orb1Y }] }]} />
      <Animated.View style={[styles.orb, styles.orb2, { transform: [{ translateY: orb2Y }] }]} />

      <Animated.View style={[styles.content, { opacity: fadeAnim, transform: [{ translateY: slideAnim }] }]}>
        {/* Logo */}
        <View style={styles.logoContainer}>
          <View style={[styles.logoRing, { borderColor: `${colors.accent}40` }]}>
            <View style={[styles.logoBg, { backgroundColor: `${colors.accent}15` }]}>
              <MapPin color={colors.accent} size={36} strokeWidth={2.5} />
            </View>
          </View>
        </View>

        <Text style={[styles.title, { color: colors.textPrimary }]}>NestPulse</Text>
        <Text style={[styles.tagline, { color: colors.textSecondary }]}>
          A private, real-time location tracker to keep your loved ones safe and connected.
        </Text>

        {/* Feature pills */}
        <View style={styles.pillsRow}>
          {['📍 Real-time GPS', '🔒 Secure', '⚡ Instant'].map((label) => (
            <View key={label} style={[styles.pill, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <Text style={[styles.pillText, { color: colors.textSecondary }]}>{label}</Text>
            </View>
          ))}
        </View>

        {/* Buttons */}
        <View style={styles.buttonContainer}>
          <TouchableOpacity
            style={[styles.button, { backgroundColor: colors.accent }]}
            onPress={() => navigation.navigate('Login')}
            activeOpacity={0.85}
          >
            <Text style={styles.buttonText}>Log In</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.buttonOutline, { borderColor: colors.border }]}
            onPress={() => navigation.navigate('Register')}
            activeOpacity={0.85}
          >
            <Text style={[styles.buttonOutlineText, { color: colors.textPrimary }]}>Create Account</Text>
          </TouchableOpacity>
        </View>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: 'center', alignItems: 'center', overflow: 'hidden' },
  orb1: {
    position: 'absolute', top: '10%', left: -80,
    width: 280, height: 280, borderRadius: 140,
    backgroundColor: '#7C6FFF22',
  },
  orb2: {
    position: 'absolute', bottom: '15%', right: -100,
    width: 240, height: 240, borderRadius: 120,
    backgroundColor: '#00CFA822',
  },
  orb: {},
  content: { alignItems: 'center', paddingHorizontal: 32, width: '100%' },
  logoContainer: { marginBottom: 28 },
  logoRing: {
    width: 100, height: 100, borderRadius: 50, borderWidth: 2,
    justifyContent: 'center', alignItems: 'center',
  },
  logoBg: {
    width: 80, height: 80, borderRadius: 40,
    justifyContent: 'center', alignItems: 'center',
  },
  logoImage: { width: 56, height: 56 },
  title: { fontSize: 42, fontWeight: '900', letterSpacing: -1, marginBottom: 12, textAlign: 'center' },
  tagline: { fontSize: 17, textAlign: 'center', lineHeight: 26, marginBottom: 28 },
  pillsRow: { flexDirection: 'row', gap: 8, marginBottom: 40, flexWrap: 'wrap', justifyContent: 'center' },
  pill: {
    paddingHorizontal: 12, paddingVertical: 6,
    borderRadius: 100, borderWidth: 1,
  },
  pillText: { fontSize: 12, fontWeight: '600' },
  buttonContainer: { width: '100%', gap: 12 },
  button: {
    width: '100%', height: 56, borderRadius: 16,
    justifyContent: 'center', alignItems: 'center',
    shadowColor: '#7C6FFF', shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.35, shadowRadius: 16, elevation: 8,
  },
  buttonText: { color: 'white', fontSize: 17, fontWeight: '700' },
  buttonOutline: {
    width: '100%', height: 56, borderRadius: 16,
    justifyContent: 'center', alignItems: 'center', borderWidth: 1.5,
  },
  buttonOutlineText: { fontSize: 17, fontWeight: '600' },
});
