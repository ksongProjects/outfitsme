export default function LandingAuth({
  authTab,
  setAuthTab,
  email,
  password,
  setEmail,
  setPassword,
  submitAuth
}) {
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
            <button className="primary-btn" onClick={() => setAuthTab("signup")}>Create your account</button>
          </div>
        </div>

        <form className="auth-panel card" onSubmit={submitAuth}>
          <div className="tab-row">
            <button
              type="button"
              className={`tab-btn ${authTab === "signin" ? "active" : ""}`}
              onClick={() => setAuthTab("signin")}
            >
              Sign in
            </button>
            <button
              type="button"
              className={`tab-btn ${authTab === "signup" ? "active" : ""}`}
              onClick={() => setAuthTab("signup")}
            >
              Sign up
            </button>
          </div>

          <input
            type="email"
            placeholder="Email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            className="text-input"
          />
          <input
            type="password"
            placeholder="Password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            className="text-input"
          />

          {authTab === "signin" ? (
            <button type="submit" className="primary-btn">Continue to dashboard</button>
          ) : (
            <button type="submit" className="primary-btn">Create account</button>
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
