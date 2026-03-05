import Link from "next/link";

export default function AppFooter() {
  const year = new Date().getFullYear();

  return (
    <footer className="app-footer">
      <p className="app-footer-copy">(c) {year} OutfitsMe. All rights reserved.</p>
      <nav className="app-footer-links" aria-label="Legal">
        <Link href="/terms">Terms of Service</Link>
        <Link href="/privacy">Privacy Policy</Link>
      </nav>
    </footer>
  );
}

