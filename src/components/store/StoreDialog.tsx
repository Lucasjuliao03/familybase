import React from 'react';
import { Modal, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Colors, FontSize, Radii, Shadow } from '../../theme';

export type StoreDialogConfig = {
  title: string;
  message: string;
  confirmLabel?: string;
  destructive?: boolean;
  onConfirm?: () => void;
};

type Props = {
  dialog: StoreDialogConfig | null;
  onClose: () => void;
};

export function StoreDialog({ dialog, onClose }: Props) {
  const handleConfirm = () => {
    const action = dialog?.onConfirm;
    onClose();
    action?.();
  };

  return (
    <Modal
      visible={!!dialog}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <View style={styles.overlay}>
        <View style={styles.card} accessibilityRole="alert">
          <Text style={styles.title}>{dialog?.title}</Text>
          <Text style={styles.message}>{dialog?.message}</Text>
          <View style={styles.actions}>
            {dialog?.onConfirm ? (
              <TouchableOpacity
                accessibilityRole="button"
                onPress={onClose}
                style={[styles.button, styles.cancelButton]}
              >
                <Text style={styles.cancelText}>Cancelar</Text>
              </TouchableOpacity>
            ) : null}
            <TouchableOpacity
              accessibilityRole="button"
              onPress={handleConfirm}
              style={[styles.button, styles.confirmButton, dialog?.destructive && styles.destructiveButton]}
            >
              <Text style={styles.confirmText}>{dialog?.confirmLabel || 'OK'}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: 'center',
    padding: 24,
    backgroundColor: 'rgba(20, 27, 55, 0.48)',
  },
  card: {
    width: '100%',
    maxWidth: 420,
    alignSelf: 'center',
    backgroundColor: Colors.surface,
    borderRadius: Radii.lg,
    padding: 22,
    ...Shadow.sm,
  },
  title: {
    color: Colors.text,
    fontSize: FontSize.base,
    fontWeight: '900',
    marginBottom: 8,
  },
  message: {
    color: Colors.textSecondary,
    fontSize: FontSize.sm,
    lineHeight: 22,
  },
  actions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 10,
    marginTop: 24,
  },
  button: {
    minWidth: 100,
    minHeight: 44,
    paddingHorizontal: 16,
    borderRadius: Radii.full,
    justifyContent: 'center',
    alignItems: 'center',
  },
  cancelButton: {
    backgroundColor: Colors.bg,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  cancelText: {
    color: Colors.text,
    fontWeight: '800',
  },
  confirmButton: { backgroundColor: Colors.primary },
  destructiveButton: { backgroundColor: Colors.danger },
  confirmText: { color: Colors.white, fontWeight: '900' },
});
