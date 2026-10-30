import { lazy, Suspense } from 'react';
import WebFamilyLayout from './WebFamilyLayout';
import PageLoader from '../PageLoader';
import { PARENT_NAV_SECTIONS } from '../../lib/familyNavigation';

// The browser build eliminates this legacy branch. The Expo app lives in /mobile.
const LegacyLayout = import.meta.env.MODE === 'capacitor'
  ? lazy(() => import('../../platform/legacy-capacitor/ParentLayout')) : null;

export default function ParentLayout() {
  if (LegacyLayout) return <Suspense fallback={<PageLoader/>}><LegacyLayout/></Suspense>;
  return <WebFamilyLayout role="parent" sections={PARENT_NAV_SECTIONS}/>;
}
