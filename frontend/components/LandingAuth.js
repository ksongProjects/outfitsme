import { useAuthContext } from "../context/DashboardContext";
import { Tabs } from "@base-ui/react/tabs";
import BaseButton from "./ui/BaseButton";
import BaseInput from "./ui/BaseInput";

export default function LandingAuth() {
  const {
    authTab,
    setAuthTab,
    email,
    password,
    setEmail,
    setPassword,
    submitAuth
  } = useAuthContext();

  return (
    <main className="landing">
      <header className="topbar">
        <div className="brand">OutfitMe</div>
      </header>

      <section className="hero">
        <div>
          <p className="eyebrow">OutfitMe v1</p>
          <h1>Find your style from one photo.</h1>
          <p className="hero-copy">
            Upload outfit images, identify clothing items with AI, and build your wardrobe with shoppable alternatives.
          </p>
          <div className="hero-actions">
            <BaseButton variant="primary" onClick={() => setAuthTab("signup")}>Create your account</BaseButton>
          </div>
        </div>

        <form className="auth-panel card" onSubmit={submitAuth}>
          <Tabs.Root value={authTab} onValueChange={(nextValue) => setAuthTab(nextValue)}>
            <Tabs.List className="tab-row">
              <Tabs.Tab className="tab-btn" value="signin">Sign in</Tabs.Tab>
              <Tabs.Tab className="tab-btn" value="signup">Sign up</Tabs.Tab>
            </Tabs.List>
          </Tabs.Root>

          <BaseInput
            type="email"
            placeholder="Email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
          />
          <BaseInput
            type="password"
            placeholder="Password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
          />

          {authTab === "signin" ? (
            <BaseButton type="submit" variant="primary">Continue to dashboard</BaseButton>
          ) : (
            <BaseButton type="submit" variant="primary">Create account</BaseButton>
          )}

        </form>
      </section>

      <section className="feature-grid">
        <article className="feature-card">
          <h3>Analyze Outfit</h3>
          <p>Use Gemini to detect style and clothing items from photos.</p>
        </article>
        <article className="feature-card">
          <h3>Build Wardrobe</h3>
          <p>Save analyzed looks and browse them with signed private image access.</p>
        </article>
        <article className="feature-card">
          <h3>Find Similar</h3>
          <p>Get similar item suggestions and price availability for each detected item.</p>
        </article>
      </section>
    </main>
  );
}
