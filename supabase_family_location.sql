-- ==========================================
-- FAMILYBASE — MÓDULO DE LOCALIZAÇÃO FAMILIAR
-- Execute no SQL Editor do Supabase DEPOIS de supabase.sql
-- ==========================================

-- Remove tabelas antigas para evitar conflito de colunas e restrições modificadas
DROP TABLE IF EXISTS public.family_member_devices CASCADE;
DROP TABLE IF EXISTS public.family_locations CASCADE;

-- ==========================================
-- 1. DISPOSITIVOS DE LOCALIZAÇÃO (MULTI-DEVICE)
-- ==========================================
CREATE TABLE IF NOT EXISTS public.family_member_devices (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    family_id UUID NOT NULL REFERENCES public.families(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    device_id TEXT NOT NULL,
    device_name TEXT,
    device_type TEXT,
    last_seen_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()),
    is_location_enabled BOOLEAN DEFAULT true,
    is_primary_location_device BOOLEAN DEFAULT false,
    UNIQUE(family_id, user_id, device_id)
);

-- ==========================================
-- 2. LOCALIZAÇÃO EM TEMPO REAL DOS MEMBROS
-- ==========================================
CREATE TABLE IF NOT EXISTS public.family_locations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    family_id UUID NOT NULL REFERENCES public.families(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    device_id TEXT NOT NULL,
    latitude DOUBLE PRECISION NOT NULL,
    longitude DOUBLE PRECISION NOT NULL,
    accuracy DOUBLE PRECISION,
    speed DOUBLE PRECISION,
    heading DOUBLE PRECISION,
    battery_level DOUBLE PRECISION,
    source TEXT DEFAULT 'gps',
    share_with_children BOOLEAN DEFAULT true,
    status TEXT DEFAULT 'moving' CHECK(status IN ('home','school','work','moving','offline')),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()),
    UNIQUE(family_id, user_id, device_id)
);

-- Drop old unique constraint if updating from previous version
ALTER TABLE public.family_locations DROP CONSTRAINT IF EXISTS family_locations_family_id_user_id_key;

-- ==========================================
-- 3. ZONAS SEGURAS DA FAMÍLIA
-- ==========================================
CREATE TABLE IF NOT EXISTS public.safe_zones (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    family_id UUID NOT NULL REFERENCES public.families(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    type TEXT DEFAULT 'home' CHECK(type IN ('home','school','work','other')),
    icon TEXT DEFAULT '📍',
    latitude DOUBLE PRECISION NOT NULL,
    longitude DOUBLE PRECISION NOT NULL,
    radius_meters INTEGER DEFAULT 200,
    color TEXT DEFAULT '#10B981',
    is_active BOOLEAN DEFAULT true,
    created_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())
);

-- ==========================================
-- 4. EVENTOS DE ENTRADA/SAÍDA EM ZONAS
-- ==========================================
CREATE TABLE IF NOT EXISTS public.location_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    family_id UUID NOT NULL REFERENCES public.families(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    zone_id UUID NOT NULL REFERENCES public.safe_zones(id) ON DELETE CASCADE,
    event_type TEXT NOT NULL CHECK(event_type IN ('enter','exit')),
    latitude DOUBLE PRECISION,
    longitude DOUBLE PRECISION,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())
);

-- ==========================================
-- ÍNDICES
-- ==========================================
CREATE INDEX IF NOT EXISTS idx_family_member_devices_family ON public.family_member_devices(family_id);
CREATE INDEX IF NOT EXISTS idx_family_member_devices_user ON public.family_member_devices(user_id);
CREATE INDEX IF NOT EXISTS idx_family_locations_family ON public.family_locations(family_id);
CREATE INDEX IF NOT EXISTS idx_family_locations_user ON public.family_locations(user_id);
CREATE INDEX IF NOT EXISTS idx_family_locations_device ON public.family_locations(device_id);
CREATE INDEX IF NOT EXISTS idx_family_locations_updated ON public.family_locations(updated_at);
CREATE INDEX IF NOT EXISTS idx_safe_zones_family ON public.safe_zones(family_id);
CREATE INDEX IF NOT EXISTS idx_location_events_family ON public.location_events(family_id);
CREATE INDEX IF NOT EXISTS idx_location_events_user ON public.location_events(user_id);
CREATE INDEX IF NOT EXISTS idx_location_events_created ON public.location_events(created_at);

-- ==========================================
-- RLS
-- ==========================================
ALTER TABLE public.family_member_devices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.family_locations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.safe_zones ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.location_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Family can access family_member_devices" ON public.family_member_devices;
DROP POLICY IF EXISTS "Family can access locations" ON public.family_locations;
DROP POLICY IF EXISTS "Family can access safe_zones" ON public.safe_zones;
DROP POLICY IF EXISTS "Family can access location_events" ON public.location_events;

CREATE POLICY "Family can access family_member_devices" ON public.family_member_devices
  FOR ALL USING (family_id = public.get_current_user_family_id());

CREATE POLICY "Family can access locations" ON public.family_locations
  FOR ALL USING (family_id = public.get_current_user_family_id());

CREATE POLICY "Family can access safe_zones" ON public.safe_zones
  FOR ALL USING (family_id = public.get_current_user_family_id());

CREATE POLICY "Family can access location_events" ON public.location_events
  FOR ALL USING (family_id = public.get_current_user_family_id());

-- ==========================================
-- TRIGGERS updated_at
-- ==========================================
DROP TRIGGER IF EXISTS update_family_locations_modtime ON public.family_locations;
CREATE TRIGGER update_family_locations_modtime
  BEFORE UPDATE ON public.family_locations
  FOR EACH ROW EXECUTE PROCEDURE update_modified_column();

DROP TRIGGER IF EXISTS update_safe_zones_modtime ON public.safe_zones;
CREATE TRIGGER update_safe_zones_modtime
  BEFORE UPDATE ON public.safe_zones
  FOR EACH ROW EXECUTE PROCEDURE update_modified_column();

-- ==========================================
-- HABILITAR REALTIME
-- (Adiciona as tabelas ao realtime apenas se ainda não estiverem)
-- ==========================================
DO $$
BEGIN
  -- family_member_devices
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_rel pr 
    JOIN pg_publication p ON p.oid = pr.prpubid 
    JOIN pg_class c ON c.oid = pr.prrelid 
    WHERE p.pubname = 'supabase_realtime' AND c.relname = 'family_member_devices'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.family_member_devices;
  END IF;

  -- family_locations
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_rel pr 
    JOIN pg_publication p ON p.oid = pr.prpubid 
    JOIN pg_class c ON c.oid = pr.prrelid 
    WHERE p.pubname = 'supabase_realtime' AND c.relname = 'family_locations'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.family_locations;
  END IF;

  -- location_events
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_rel pr 
    JOIN pg_publication p ON p.oid = pr.prpubid 
    JOIN pg_class c ON c.oid = pr.prrelid 
    WHERE p.pubname = 'supabase_realtime' AND c.relname = 'location_events'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.location_events;
  END IF;
END $$;
