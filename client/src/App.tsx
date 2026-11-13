import { Navigate, Route, Routes } from 'react-router-dom'
import { AppLayout } from './components/layout/AppLayout.tsx'
import { useAuth } from './lib/auth.tsx'
import { CurrentStoreProvider } from './lib/current-store.tsx'
import { BrandKitPage } from './pages/BrandKitPage.tsx'
import { CreatePostPage } from './pages/CreatePostPage.tsx'
import { DashboardPage } from './pages/DashboardPage.tsx'
import { LoginPage } from './pages/LoginPage.tsx'
import { Placeholder } from './pages/Placeholder.tsx'
import { SettingsPage } from './pages/SettingsPage.tsx'
import { SourcesPage } from './pages/SourcesPage.tsx'
import { StoreFormPage } from './pages/StoreFormPage.tsx'
import { StoresPage } from './pages/StoresPage.tsx'

export default function App() {
  const { me, isLoading } = useAuth()

  if (isLoading) return <div className="min-h-svh bg-sidebar" />
  // Not logged in: show login on any URL; after login the same URL renders.
  if (!me) return <LoginPage />

  return (
    <CurrentStoreProvider key={me._id}>
      <Routes>
        <Route element={<AppLayout />}>
          <Route index element={<DashboardPage />} />
          <Route path="posts/new" element={<CreatePostPage />} />
          <Route path="posts/:id" element={<CreatePostPage />} />
          <Route path="sources" element={<SourcesPage />} />
          <Route path="approvals" element={<Placeholder title="Approval Queue" note="Jab post ka image ban kar verify ho jayega, wo approval ke liye yahan aayegi. Abhi drafts Create Post ke 'Recent posts' me hain." />} />
          <Route path="calendar" element={<Placeholder title="Content Calendar" note="Phase 2: festival dates par auto-draft + har hafte ka post plan (7–14 posts). Phase 1 (approval + publish) poora hone ke baad banega." />} />
          <Route path="analytics" element={<Placeholder title="Analytics" note="Phase 2: reach, engagement, clicks aur UTM se Shopify sales. Pehle posts publish hone chahiye, tabhi data aayega." />} />
          <Route path="brand-kit" element={<BrandKitPage />} />
          <Route path="ai-models" element={<Placeholder title="AI Models & Prompts" />} />
          <Route path="integrations" element={<Placeholder title="Integrations" note="Shopify, Meta, Cloudinary connections" />} />
          <Route path="stores" element={<StoresPage />} />
          <Route path="stores/new" element={me.isSuperAdmin ? <StoreFormPage /> : <Navigate to="/stores" replace />} />
          <Route path="stores/:id" element={<StoreFormPage key="edit" />} />
          <Route path="settings" element={<SettingsPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </CurrentStoreProvider>
  )
}
