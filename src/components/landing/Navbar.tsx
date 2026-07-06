'use client';

import { useState } from 'react';
import Link from 'next/link';
import { motion, type Variants } from 'framer-motion';
import { Download, Menu, User } from 'lucide-react';
import DiscordIcon from '@/components/ui/DiscordIcon';
import GlassButton from '@/components/ui/GlassButton';
import IconButton from '@/components/ui/IconButton';
import Logo from '@/components/ui/Logo';
import { NAV_LINKS } from '@/lib/constants';
import MobileMenu from './MobileMenu';

const listVariants: Variants = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.05, delayChildren: 0.35 } },
};

const itemVariants: Variants = {
  hidden: { opacity: 0, y: -14 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.5, ease: [0.22, 1, 0.36, 1] } },
};

export default function Navbar() {
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <motion.header
      initial={{ y: -28, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
      className="absolute inset-x-0 top-0 z-30 px-4 pt-4 sm:px-6 lg:px-8"
    >
      <nav className="glass-deep flex h-16 items-center justify-between gap-4 rounded-2xl px-4 sm:px-5" aria-label="Primary">
        <Logo />

        <motion.ul variants={listVariants} initial="hidden" animate="visible" className="hidden items-center gap-1 xl:flex">
          {NAV_LINKS.map((link) => {
            const linkClasses =
              'group relative rounded-md px-3 py-2 text-[13px] font-medium text-white/65 transition-colors duration-300 hover:text-white hover:[text-shadow:0_0_14px_rgba(0,245,255,0.6)] focus-visible:outline-none focus-visible:text-white';
            const underline = (
              <span
                className="absolute inset-x-3 -bottom-0.5 h-px origin-left scale-x-0 bg-gradient-to-r from-neon-cyan to-neon-purple transition-transform duration-300 group-hover:scale-x-100"
                aria-hidden
              />
            );
            return (
              <motion.li key={link.label} variants={itemVariants}>
                {link.href.startsWith('/') ? (
                  <Link href={link.href} className={linkClasses}>
                    {link.label}
                    {underline}
                  </Link>
                ) : (
                  <a href={link.href} className={linkClasses}>
                    {link.label}
                    {underline}
                  </a>
                )}
              </motion.li>
            );
          })}
        </motion.ul>

        <div className="flex items-center gap-2">
          <GlassButton variant="primary" size="sm" href="/play" className="hidden sm:inline-flex">
            Play Now
          </GlassButton>
          <GlassButton variant="glass" size="sm" icon={Download} href="#download" className="hidden lg:inline-flex">
            Download
          </GlassButton>
          <IconButton label="Join our Discord" href="#community">
            <DiscordIcon className="h-4 w-4" />
          </IconButton>
          <IconButton label="Profile" href="#profile">
            <User className="h-4 w-4" aria-hidden />
          </IconButton>
          <IconButton label="Open menu" className="xl:hidden" onClick={() => setMenuOpen(true)}>
            <Menu className="h-4 w-4" aria-hidden />
          </IconButton>
        </div>
      </nav>

      <MobileMenu open={menuOpen} onClose={() => setMenuOpen(false)} />
    </motion.header>
  );
}
