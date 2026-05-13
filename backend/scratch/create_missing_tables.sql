-- Missing tables for FamilyBase PostgreSQL migration

CREATE TABLE IF NOT EXISTS task_allowance_rules (
    id UUID PRIMARY KEY,
    task_id UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
    affects_allowance BOOLEAN DEFAULT FALSE,
    bonus_amount DECIMAL(10,2) DEFAULT 0,
    discount_amount DECIMAL(10,2) DEFAULT 0,
    apply_discount_if_late BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS grades (
    id UUID PRIMARY KEY,
    subject VARCHAR(255) NOT NULL,
    type VARCHAR(50) DEFAULT 'test',
    score DECIMAL(5,2),
    max_score DECIMAL(5,2) DEFAULT 10,
    concept VARCHAR(50),
    observation TEXT,
    date DATE DEFAULT CURRENT_DATE,
    child_id UUID NOT NULL REFERENCES children(id) ON DELETE CASCADE,
    family_id UUID NOT NULL REFERENCES families(id) ON DELETE CASCADE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS calendar_events (
    id UUID PRIMARY KEY,
    title VARCHAR(255) NOT NULL,
    description TEXT,
    date DATE NOT NULL,
    time TIME,
    type VARCHAR(50) DEFAULT 'family',
    child_id UUID REFERENCES children(id) ON DELETE CASCADE,
    family_id UUID NOT NULL REFERENCES families(id) ON DELETE CASCADE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS history (
    id UUID PRIMARY KEY,
    event TEXT NOT NULL,
    points INTEGER DEFAULT 0,
    coins INTEGER DEFAULT 0,
    type VARCHAR(50),
    child_id UUID NOT NULL REFERENCES children(id) ON DELETE CASCADE,
    family_id UUID NOT NULL REFERENCES families(id) ON DELETE CASCADE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS notifications (
    id UUID PRIMARY KEY,
    title VARCHAR(255) NOT NULL,
    message TEXT,
    type VARCHAR(50) DEFAULT 'info',
    icon VARCHAR(50),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    child_id UUID REFERENCES children(id) ON DELETE CASCADE,
    family_id UUID NOT NULL REFERENCES families(id) ON DELETE CASCADE,
    is_read BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS medication_logs (
    id UUID PRIMARY KEY,
    family_id UUID NOT NULL REFERENCES families(id) ON DELETE CASCADE,
    child_id UUID REFERENCES children(id) ON DELETE CASCADE,
    patient_user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    medication_id UUID NOT NULL REFERENCES medications(id) ON DELETE CASCADE,
    taken_date DATE DEFAULT CURRENT_DATE,
    taken_time TIME,
    status VARCHAR(50) DEFAULT 'taken',
    notes TEXT,
    registered_by UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS shopping_list (
    id UUID PRIMARY KEY,
    family_id UUID NOT NULL REFERENCES families(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    is_urgent BOOLEAN DEFAULT FALSE,
    is_bought BOOLEAN DEFAULT FALSE,
    quantity VARCHAR(50),
    price DECIMAL(10,2) DEFAULT 0,
    establishment VARCHAR(255),
    description TEXT,
    registered_by UUID REFERENCES users(id) ON DELETE SET NULL,
    bought_by UUID REFERENCES users(id) ON DELETE SET NULL,
    bought_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS family_notices (
    id UUID PRIMARY KEY,
    family_id UUID NOT NULL REFERENCES families(id) ON DELETE CASCADE,
    title VARCHAR(255) NOT NULL,
    description TEXT,
    type VARCHAR(50) DEFAULT 'notice',
    priority VARCHAR(50) DEFAULT 'normal',
    target_type VARCHAR(50) DEFAULT 'all',
    target_user_ids JSONB DEFAULT '[]',
    target_child_ids JSONB DEFAULT '[]',
    start_datetime TIMESTAMP,
    due_datetime TIMESTAMP,
    notice_time TIME,
    is_recurring BOOLEAN DEFAULT FALSE,
    recurrence_rule TEXT,
    is_pinned BOOLEAN DEFAULT FALSE,
    requires_read_confirmation BOOLEAN DEFAULT FALSE,
    status VARCHAR(50) DEFAULT 'active',
    completed_at TIMESTAMP,
    created_by UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS notice_reads (
    id UUID PRIMARY KEY,
    notice_id UUID NOT NULL REFERENCES family_notices(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    read_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    confirmed_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS savings_conversion_requests (
    id UUID PRIMARY KEY,
    family_id UUID NOT NULL REFERENCES families(id) ON DELETE CASCADE,
    child_id UUID NOT NULL REFERENCES children(id) ON DELETE CASCADE,
    cycle_id UUID REFERENCES allowance_cycles(id) ON DELETE SET NULL,
    savings_goal_id UUID REFERENCES savings_goals(id) ON DELETE CASCADE,
    requested_amount DECIMAL(10,2) NOT NULL,
    message TEXT,
    status VARCHAR(50) DEFAULT 'pending',
    review_note TEXT,
    reviewed_by UUID REFERENCES users(id) ON DELETE SET NULL,
    reviewed_at TIMESTAMP,
    requested_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS audit_logs (
    id UUID PRIMARY KEY,
    family_id UUID NOT NULL REFERENCES families(id) ON DELETE CASCADE,
    user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    role VARCHAR(50),
    module VARCHAR(50),
    action VARCHAR(100),
    description TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS push_subscriptions (
    id UUID PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    family_id UUID NOT NULL REFERENCES families(id) ON DELETE CASCADE,
    subscription_json JSONB NOT NULL,
    device_name VARCHAR(255),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Correção de constraint para permitir consultas de adultos sem filhos associados
ALTER TABLE public.health_appointments ALTER COLUMN child_id DROP NOT NULL;
