import React, { useEffect, useRef, useState } from "react";

// Import Styles
import './Nav.css';

// Import PDF
import resumePDF from '../../assets/Travis-Resume.pdf';

const DRAWER_ID = 'nav-drawer';

const sectionLinks = [
  { href: '#about', label: 'About' },
  { href: '#experience', label: 'Experience' },
  { href: '#projects', label: 'Projects' },
  { href: '#skills', label: 'Skills' },
  { href: '#education', label: 'Education' },
];

const Nav: React.FC = () => {
  const [open, setOpen] = useState(false);
  const burgerRef = useRef<HTMLButtonElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);

  const closeDrawer = () => {
    setOpen(false);
    burgerRef.current?.focus({ preventScroll: true });
  };

  // While the drawer is open: lock body scroll, park focus on the close
  // button, and let Escape dismiss it.
  useEffect(() => {
    if (!open) return;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    closeRef.current?.focus({ preventScroll: true });

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      setOpen(false);
      burgerRef.current?.focus({ preventScroll: true });
    };
    document.addEventListener('keydown', onKeyDown);

    // The drawer only exists below the desktop breakpoint; if the viewport
    // grows past it while open, drop the state so the scroll lock lifts.
    const onResize = () => {
      if (window.innerWidth >= 800) setOpen(false);
    };
    window.addEventListener('resize', onResize);

    return () => {
      document.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('resize', onResize);
      document.body.style.overflow = previousOverflow;
    };
  }, [open]);

  return (
    <>
      <nav className="nav" aria-label="Site">
        <div className="wrap nav-inner">
          <a href="#top" className="nav-brand">Travis Tincher</a>

          <div className="nav-desktop">
            <ul className="nav-links">
              {sectionLinks.map((link) => (
                <li key={link.href}>
                  <a href={link.href} className="nav-link">{link.label}</a>
                </li>
              ))}
            </ul>
            <a
              href={resumePDF}
              target="_blank"
              rel="noreferrer"
              className="nav-link nav-resume"
            >
              Resume
            </a>
          </div>

          <button
            type="button"
            className="nav-burger"
            ref={burgerRef}
            aria-label="Open menu"
            aria-expanded={open}
            aria-controls={DRAWER_ID}
            onClick={() => setOpen(true)}
          >
            <span className="nav-burger-bars" aria-hidden="true" />
          </button>
        </div>
      </nav>

      <div
        className={`nav-backdrop${open ? ' is-open' : ''}`}
        onClick={closeDrawer}
        aria-hidden="true"
      />

      <div id={DRAWER_ID} className={`nav-drawer${open ? ' is-open' : ''}`}>
        <div className="nav-drawer-head">
          <button
            type="button"
            className="nav-close"
            ref={closeRef}
            aria-label="Close menu"
            onClick={closeDrawer}
          >
            <span className="nav-close-mark" aria-hidden="true">×</span>
          </button>
        </div>

        <ul className="nav-drawer-links">
          {sectionLinks.map((link) => (
            <li key={link.href}>
              <a href={link.href} className="nav-drawer-link" onClick={closeDrawer}>
                {link.label}
              </a>
            </li>
          ))}
          <li>
            <a
              href={resumePDF}
              target="_blank"
              rel="noreferrer"
              className="nav-drawer-link"
              onClick={closeDrawer}
            >
              Resume
            </a>
          </li>
        </ul>
      </div>
    </>
  );
};

export default Nav;
