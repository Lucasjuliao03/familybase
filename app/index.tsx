import { Redirect } from 'expo-router';

/** Entrada directa no login — evita spinner de 1 minuto à espera da navegação. */
export default function IndexScreen() {
  return <Redirect href="/login" />;
}
