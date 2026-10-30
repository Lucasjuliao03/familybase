import { lazy, Suspense } from 'react';
import WebFamilyLayout from './WebFamilyLayout';
import PageLoader from '../PageLoader';
import { CHILD_NAV_SECTIONS } from '../../lib/familyNavigation';

// The browser build eliminates this legacy branch. The Expo app lives in /mobile.
const LegacyLayout = import.meta.env.MODE === 'capacitor'
  ? lazy(() => import('../../platform/legacy-capacitor/ChildLayout')) : null;

export default function ChildLayout() {
  if (LegacyLayout) return <Suspense fallback={<PageLoader/>}><LegacyLayout/></Suspense>;
  return <WebFamilyLayout role="child" sections={CHILD_NAV_SECTIONS}/>;
}
