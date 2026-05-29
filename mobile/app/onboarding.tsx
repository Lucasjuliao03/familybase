import React, { useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  StatusBar, Dimensions,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { Colors, Radii, Shadow, FontSize, Spacing } from '../src/theme';
import { PrimaryButton } from '../src/components/ui/PrimaryButton';

const { width: W } = Dimensions.get('window');

/** Ilustração da família em estilo cartoon/emoji */
function FamilyIllustration() {
  return (
    <View style={fam.container}>
      {/* Ícones flutuantes */}
      <View style={[fam.float, { top: 10, left: 10 }]}>
        <View style={[fam.floatBubble, { backgroundColor: '#EDE9FE' }]}>
          <Text style={fam.floatIcon}>📅</Text>
        </View>
      </View>
      <View style={[fam.float, { top: 0, right: 30 }]}>
        <View style={[fam.floatBubble, { backgroundColor: '#D1FAE5' }]}>
          <Text style={fam.floatIcon}>✅</Text>
        </View>
      </View>
      <View style={[fam.float, { bottom: 20, left: 20 }]}>
        <View style={[fam.floatBubble, { backgroundColor: '#FDF2F8' }]}>
          <Text style={fam.floatIcon}>📍</Text>
        </View>
      </View>
      <View style={[fam.float, { bottom: 10, right: 10 }]}>
        <View style={[fam.floatBubble, { backgroundColor: '#FEF9C3' }]}>
          <Text style={fam.floatIcon}>❤️</Text>
        </View>
      </View>

      {/* Membros da família */}
      <View style={fam.members}>
        {/* Pai */}
        <View style={fam.memberWrap}>
          <View style={[fam.memberCircle, { backgroundColor: '#D1FAE5', width: 72, height: 72, borderRadius: 36 }]}>
            <Text style={{ fontSize: 40 }}>🧔</Text>
          </View>
          <Text style={fam.memberLabel}>Pai</Text>
        </View>

        {/* Filhos (centro) */}
        <View style={{ alignItems: 'center', gap: 0, marginTop: -10 }}>
          <View style={fam.childRow}>
            <View style={fam.memberWrap}>
              <View style={[fam.memberCircle, { backgroundColor: '#DBEAFE', width: 62, height: 62, borderRadius: 31 }]}>
                <Text style={{ fontSize: 34 }}>👦</Text>
              </View>
            </View>
            <View style={fam.memberWrap}>
              <View style={[fam.memberCircle, { backgroundColor: '#FDF2F8', width: 62, height: 62, borderRadius: 31 }]}>
                <Text style={{ fontSize: 34 }}>👧</Text>
              </View>
            </View>
          </View>
        </View>

        {/* Mãe */}
        <View style={fam.memberWrap}>
          <View style={[fam.memberCircle, { backgroundColor: '#FEF9C3', width: 72, height: 72, borderRadius: 36 }]}>
            <Text style={{ fontSize: 40 }}>👩</Text>
          </View>
          <Text style={fam.memberLabel}>Mãe</Text>
        </View>
      </View>
    </View>
  );
}

const fam = StyleSheet.create({
  container: {
    width: W - 48,
    height: 200,
    position: 'relative',
    alignSelf: 'center',
    marginVertical: 16,
  },
  float:       { position: 'absolute', zIndex: 2 },
  floatBubble: {
    width: 40, height: 40, borderRadius: 20,
    justifyContent: 'center', alignItems: 'center',
    ...Shadow.sm,
  },
  floatIcon: { fontSize: 20 },
  members:   {
    position: 'absolute', left: 0, right: 0, top: 20, bottom: 0,
    flexDirection: 'row', justifyContent: 'center',
    alignItems: 'center', gap: 16,
  },
  memberWrap:   { alignItems: 'center', gap: 4 },
  memberCircle: { justifyContent: 'center', alignItems: 'center', ...Shadow.sm },
  memberLabel:  { fontSize: 10, color: 'rgba(255,255,255,0.9)', fontWeight: '700' },
  childRow:     { flexDirection: 'row', gap: 8, marginTop: 12 },
});

export default function OnboardingScreen() {
  const router  = useRouter();
  const [page, setPage] = useState(0);

  return (
    <View style={styles.root}>
      <StatusBar barStyle="light-content" />

      {/* Header gradient com família */}
      <LinearGradient
        colors={[Colors.gradStart, Colors.gradMid, Colors.gradEnd]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.hero}
      >
        <FamilyIllustration />
      </LinearGradient>

      {/* Conteúdo inferior */}
      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        {/* Logo */}
        <View style={styles.logoRow}>
          <View style={styles.logoCircle}>
            <Text style={styles.logoEmoji}>🏠</Text>
          </View>
        </View>

        {/* Título */}
        <Text style={styles.appName}>Família{'\n'}em harmonia</Text>

        {/* Tagline */}
        <Text style={styles.tagline}>Tudo que sua família precisa, em um só lugar</Text>

        {/* Descrição */}
        <Text style={styles.desc}>
          Tarefas, calendário, mesadas, compras, localização e muito mais! 🌟
        </Text>

        {/* Page dots */}
        <View style={styles.dots}>
          {[0, 1, 2].map((i) => (
            <View key={i} style={[styles.dot, i === page && styles.dotActive]} />
          ))}
        </View>

        {/* CTA */}
        <PrimaryButton
          label="Vamos começar! 🚀"
          onPress={() => router.replace('/login')}
          style={styles.ctaBtn}
        />

        {/* Login card */}
        <TouchableOpacity
          style={styles.loginCard}
          onPress={() => router.push('/login')}
          activeOpacity={0.8}
        >
          <Text style={styles.loginCardSub}>Já tem uma conta?</Text>
          <Text style={styles.loginCardAction}>Fazer login</Text>
        </TouchableOpacity>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root:    { flex: 1, backgroundColor: Colors.bg },
  hero:    {
    paddingTop: 56,
    paddingBottom: 32,
    borderBottomLeftRadius: 32,
    borderBottomRightRadius: 32,
    ...Shadow.lg,
  },

  content: { paddingHorizontal: 24, paddingBottom: 40, alignItems: 'center' },

  logoRow:    { marginTop: 24 },
  logoCircle: {
    width: 68, height: 68, borderRadius: 34,
    backgroundColor: Colors.primary,
    justifyContent: 'center', alignItems: 'center',
    ...Shadow.btn,
  },
  logoEmoji: { fontSize: 34 },

  appName: {
    fontSize: FontSize.xxxl - 4,
    fontWeight: '900',
    color: Colors.text,
    textAlign: 'center',
    lineHeight: 38,
    marginTop: 16,
  },
  tagline: {
    fontSize: FontSize.md,
    fontWeight: '700',
    color: Colors.textSecondary,
    textAlign: 'center',
    marginTop: 10,
  },
  desc: {
    fontSize: FontSize.sm,
    color: Colors.textMuted,
    textAlign: 'center',
    lineHeight: 20,
    marginTop: 8,
    paddingHorizontal: 16,
  },

  dots: { flexDirection: 'row', gap: 8, marginTop: 20, marginBottom: 28 },
  dot: {
    width: 8, height: 8, borderRadius: 4,
    backgroundColor: Colors.border,
  },
  dotActive: { width: 22, backgroundColor: Colors.primary },

  ctaBtn: { marginBottom: 14 },

  loginCard: {
    backgroundColor: Colors.surface,
    borderRadius: Radii.lg,
    paddingVertical: 18,
    paddingHorizontal: 32,
    alignItems: 'center',
    width: '100%',
    ...Shadow.sm,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  loginCardSub:    { fontSize: FontSize.xs, color: Colors.textMuted },
  loginCardAction: {
    fontSize: FontSize.base,
    fontWeight: '700',
    color: Colors.primary,
    marginTop: 2,
  },
});
