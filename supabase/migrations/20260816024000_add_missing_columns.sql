-- Migration to add missing columns

-- Add meta column to ai_suggestions if it doesn't already exist
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'ai_suggestions' AND column_name = 'meta') THEN
        ALTER TABLE ai_suggestions ADD COLUMN meta JSONB DEFAULT '{}'::jsonb;
    END IF;
END $$;

-- Add created_at column to ai_agents if it doesn't already exist
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'ai_agents' AND column_name = 'created_at') THEN
        ALTER TABLE ai_agents ADD COLUMN created_at TIMESTAMPTZ DEFAULT now() NOT NULL;
    END IF;
END $$;
