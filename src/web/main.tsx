import {createClient} from '@supabase/supabase-js';
import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import {App} from './app';
import {readWebConfig} from './config';
import {ApiProvider} from './data/api_context';
import {createSupabaseApi} from './data/supabase_api';
import './index.css';

const root = createRoot(document.getElementById('root') as HTMLElement);
const config = readWebConfig(import.meta.env);

if (config === null && import.meta.env.DEV) {
  // Local preview with sample data; stripped from production builds.
  void import('./dev/demo_api').then(({createDemoApi}) =>
    root.render(
      <StrictMode>
        <ApiProvider api={createDemoApi()}>
          <App />
        </ApiProvider>
      </StrictMode>,
    ),
  );
} else if (config === null) {
  root.render(
    <main className="text-ink mx-auto max-w-xl p-8">
      <h1 className="mb-2 text-2xl font-semibold">Not configured</h1>
      <p>
        Set VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY when building.
        See docs/SETUP.md.
      </p>
    </main>,
  );
} else {
  const supabase = createClient(
    config.supabaseUrl,
    config.supabasePublishableKey,
  );
  root.render(
    <StrictMode>
      <ApiProvider api={createSupabaseApi(supabase)}>
        <App />
      </ApiProvider>
    </StrictMode>,
  );
}
