import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://vghoucqgdwfgftvifavw.supabase.co';
const supabaseKey = 'sb_publishable_kD7rFwUtqo65GuKuDu_DsA_KWm6PoeU';

export const supabase = createClient(supabaseUrl, supabaseKey);
