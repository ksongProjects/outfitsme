"use client";

import Image from "next/image";

import { cn } from "@/lib/utils";

type AppHeaderProps = {
  className?: string;
  actions?: React.ReactNode;
  children?: React.ReactNode;
  onBrandClick?: () => void;
};

export default function AppHeader({
  className,
  actions = null,
  children = null,
  onBrandClick,
}: AppHeaderProps) {
  const brandContent = (
    <span className="brand-lockup">
      <span className="brand-mark" aria-hidden="true">
        <Image
          src="/logo.png"
          alt="OutfitsMe logo"
          width={40}
          height={40}
          className="brand-mark-image"
          priority
        />
      </span>
      <span className="app-header-brand-copy">
        <span className="brand-name">OutfitsMe</span>
        <span className="brand-tagline">
          Style help, outfit ideas, and a closet you can actually use.
        </span>
      </span>
    </span>
  );

  return (
    <header className={cn("app-page-header", className)}>
      <div className="app-header">
        {onBrandClick ? (
          <button type="button" className="app-header-brand-button" onClick={onBrandClick}>
            {brandContent}
          </button>
        ) : (
          <div>{brandContent}</div>
        )}
        {actions ? <div className="app-header-actions">{actions}</div> : null}
      </div>
      {children}
    </header>
  );
}
