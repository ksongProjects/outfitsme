"use client";

import Link from "next/link";

export default function AppFooter() {
  const year = new Date().getFullYear();

  return (
    <footer className="app-footer o-cluster o-cluster--start">
      <div className="o-stack o-stack--tight o-stack--start">
        <p className="app-footer-copy">&copy; {year} OutfitsMe.</p>
        <nav className="o-cluster o-cluster--wrap o-cluster--tight" aria-label="Legal">
          <Link href="/terms">Terms of Service</Link>
          <Link href="/privacy">Privacy Policy</Link>
        </nav>
      </div>
    </footer>
  );
}
