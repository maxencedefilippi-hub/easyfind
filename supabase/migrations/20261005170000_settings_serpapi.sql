-- Add serpapi_key column to settings table
ALTER TABLE public.settings ADD COLUMN IF NOT EXISTS serpapi_key TEXT;

-- Update index for oauth_tokens
CREATE INDEX IF NOT EXISTS idx_oauth_tokens_user_provider ON public.oauth_tokens(user_id, provider);