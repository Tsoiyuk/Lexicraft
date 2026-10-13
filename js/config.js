// 把下面两行换成你的 Supabase 项目信息（与「抱佛脚」相同）。
// 位置：Supabase 控制台 → Project Settings → API。
// anon key 本来就是公开在网页里的，安全由数据库的 RLS 规则保证。
export const SUPABASE_URL = 'https://retedierxqbrvhkdzdsj.supabase.co';
export const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJldGVkaWVyeHFicnZoa2R6ZHNqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTE0MDUzMjMsImV4cCI6MjEwNjk4MTMyM30.UaHdrLjlTyrB1WlXUc-RDhlD1loIeSpeFvATnhfjNsI';

export const CONFIGURED = !SUPABASE_URL.includes('YOUR-PROJECT-REF') && !SUPABASE_ANON_KEY.includes('YOUR-ANON-KEY');
