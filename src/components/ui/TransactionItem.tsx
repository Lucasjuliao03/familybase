import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Colors, Radii, FontSize } from '../../theme';

interface Props {
  icon: string;
  iconBg: string;
  title: string;
  subtitle: string;
  amount: string;
  positive?: boolean;
  balance?: string;
}

export function TransactionItem({
  icon,
  iconBg,
  title,
  subtitle,
  amount,
  positive = true,
  balance,
}: Props) {
  return (
    <View style={styles.row}>
      <View style={[styles.iconCircle, { backgroundColor: iconBg }]}>
        <Text style={styles.iconText}>{icon}</Text>
      </View>
      <View style={styles.info}>
        <Text style={styles.title}>{title}</Text>
        <Text style={styles.sub}>{subtitle}</Text>
      </View>
      <View style={styles.right}>
        <Text style={[styles.amount, positive ? styles.positive : styles.negative]}>
          {positive ? '+ ' : '- '}{amount}
        </Text>
        {balance ? <Text style={styles.balance}>Saldo: {balance}</Text> : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    gap: 12,
    borderBottomWidth: 1,
    borderBottomColor: Colors.borderLight,
  },
  iconCircle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
  },
  iconText: { fontSize: 18 },
  info:     { flex: 1 },
  title:    { fontSize: FontSize.sm, fontWeight: '700', color: Colors.text },
  sub:      { fontSize: FontSize.xs, color: Colors.textMuted, marginTop: 1 },
  right:    { alignItems: 'flex-end' },
  amount:   { fontSize: FontSize.sm, fontWeight: '800' },
  positive: { color: Colors.green },
  negative: { color: Colors.danger },
  balance:  { fontSize: 10, color: Colors.textMuted, marginTop: 1 },
});
