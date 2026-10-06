import React from 'react';
import { Ionicons } from '@expo/vector-icons';
import { ComponentProps } from 'react';

type IonName = ComponentProps<typeof Ionicons>['name'];

const MODULE_ICON_MAP: Record<string, IonName> = {
  dashboard: 'home-outline',
  tasks: 'checkbox-outline',
  grades: 'book-outline',
  allowance: 'wallet-outline',
  family_shop: 'bag-outline',
  calendar: 'calendar-outline',
  health: 'heart-outline',
  mural: 'megaphone-outline',
  shopping: 'cart-outline',
  location: 'location-outline',
  reports: 'bar-chart-outline',
  settings: 'settings-outline',
  logout: 'log-out-outline',
  bell: 'notifications-outline',
  add: 'add-outline',
  approval: 'checkmark-circle-outline',
  pending: 'time-outline',
  completed: 'checkmark-done-outline',
  clipboard: 'clipboard-outline',
  users: 'people-outline',
  activity: 'time-outline',
  star: 'star-outline',
  streak: 'flame-outline',
  points: 'star-outline',
  store: 'storefront-outline',
};

interface ParentModuleIconProps {
  name: string;
  size?: number;
  color?: string;
  filled?: boolean;
}

export function ParentModuleIcon({ name, size = 20, color, filled = false }: ParentModuleIconProps) {
  const base = MODULE_ICON_MAP[name] || 'ellipse-outline';
  const iconName = filled && base.endsWith('-outline')
    ? (base.replace('-outline', '') as IonName)
    : base;
  return <Ionicons name={iconName} size={size} color={color} />;
}

export function getParentModuleIonName(name: string, filled = false): IonName {
  const base = MODULE_ICON_MAP[name] || 'ellipse-outline';
  if (filled && base.endsWith('-outline')) return base.replace('-outline', '') as IonName;
  return base;
}
