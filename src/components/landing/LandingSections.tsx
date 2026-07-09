'use client';

import Link from 'next/link';
import {
  Crosshair,
  Gauge,
  Map as MapIcon,
  Radio,
  Shield,
  Trophy,
  Wind,
  Zap,
} from 'lucide-react';
import DiscordIcon from '@/components/ui/DiscordIcon';
import GlassButton from '@/components/ui/GlassButton';
import { DISCORD_URL } from '@/lib/constants';

const FEATURES = [
  {
    icon: Shield,
    title: 'Server-authoritative',
    body: 'Every shot is validated on the server with ray-vs-capsule hit detection — wall-shots are mathematically impossible.',
  },
  {
    icon: Crosshair,
    title: 'Seven weapons',
    body: 'From the Longshot DMR to the Breaker 8 shotgun, each weapon is tuned for its own engagement range.',
  },
  {
    icon: Wind,
    title: 'Fluid movement',
    body: 'Sprint, slide, dash and wall-run. Chain slide-hops for a fast, expressive movement rhythm.',
  },
  {
    icon: MapIcon,
    title: 'Four arenas',
    body: 'Cyber City rooftops, Snow Base bunkers, Forest Temple ruins and the floating Sky Sanctum.',
  },
  {
    icon: Trophy,
    title: 'Ranked progression',
    body: 'Earn XP on every kill, climb account levels and fight for a spot on the global leaderboard.',
  },
  {
    icon: Zap,
    title: 'Instant browser play',
    body: 'No install, no launcher — 120 FPS-optimized WebGL powered by Three.js and Rapier physics.',
  },
];

const NEWS = [
  {
    tag: 'Characters',
    title: 'Heroes & cosmetics',
    body: 'Articulated procedural hero rigs replace the old avatars, with equippable skins and weapon tints.',
  },
  {
    tag: 'Movement',
    title: 'Wall-run & slide-hop',
    body: 'Advanced traversal: cling to walls, kick off at 45°, and chain slides into hops to keep momentum.',
  },
  {
    tag: 'Netcode',
    title: 'Lag compensation',
    body: 'Server-side rewind (behind a flag) registers hits against where you actually saw your target.',
  },
  {
    tag: 'Map',
    title: 'Sky Sanctum',
    body: 'A new floating-islands arena over an open sky — long dash gaps and a very unforgiving kill plane.',
  },
  {
    tag: 'Game feel',
    title: 'Feedback pass',
    body: 'Floating damage numbers, kill-streak banners, directional damage indicators and a reactive crosshair.',
  },
];

function SectionHeading({ eyebrow, title, subtitle }: { eyebrow: string; title: string; subtitle: string }) {
  return (
    <div className="mx-auto max-w-2xl text-center">
      <p className="text-[11px] font-semibold uppercase tracking-[0.35em] text-neon-cyan/80">{eyebrow}</p>
      <h2 className="mt-2 text-3xl font-extrabold tracking-tight text-white sm:text-4xl">{title}</h2>
      <p className="mt-3 text-sm leading-relaxed text-white/55 sm:text-[15px]">{subtitle}</p>
    </div>
  );
}

/** The scroll-anchored content sections below the landing hero. */
export default function LandingSections() {
  return (
    <>
      {/* GAME */}
      <section id="game" className="scroll-mt-24 border-t border-white/10 px-5 py-20 sm:px-8">
        <SectionHeading
          eyebrow="The Game"
          title="Built for competitive play"
          subtitle="A complete, production-grade shooter running entirely in your browser — authoritative netcode, real physics, and the movement expression to back it up."
        />
        <div className="mx-auto mt-10 grid max-w-6xl gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map((feature) => (
            <div
              key={feature.title}
              className="glass rounded-2xl p-5 transition-colors duration-300 hover:border-white/20"
            >
              <span className="grid h-11 w-11 place-items-center rounded-xl border border-neon-cyan/25 bg-neon-cyan/10 text-neon-cyan">
                <feature.icon className="h-5 w-5" aria-hidden />
              </span>
              <h3 className="mt-4 text-base font-semibold text-white">{feature.title}</h3>
              <p className="mt-1.5 text-sm leading-relaxed text-white/55">{feature.body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* RANKED */}
      <section id="ranked" className="scroll-mt-24 border-t border-white/10 px-5 py-20 sm:px-8">
        <SectionHeading
          eyebrow="Ranked"
          title="Climb the leaderboard"
          subtitle="Sign in and every online kill counts. Bank XP, level your account, and measure yourself against every pilot on the global board."
        />
        <div className="mx-auto mt-10 grid max-w-4xl gap-4 sm:grid-cols-3">
          {[
            { icon: Crosshair, stat: '+XP', label: 'Earned every kill and every minute in a match' },
            { icon: Gauge, stat: 'Levels', label: 'A rising XP curve unlocks new cosmetics as you climb' },
            { icon: Radio, stat: 'Global', label: 'Live standings by XP, level and K/D' },
          ].map((item) => (
            <div key={item.label} className="glass rounded-2xl p-5 text-center">
              <span className="mx-auto grid h-11 w-11 place-items-center rounded-xl border border-neon-orange/25 bg-neon-orange/10 text-neon-orange">
                <item.icon className="h-5 w-5" aria-hidden />
              </span>
              <p className="mt-3 text-xl font-extrabold text-white">{item.stat}</p>
              <p className="mt-1 text-xs leading-relaxed text-white/50">{item.label}</p>
            </div>
          ))}
        </div>
        <div className="mt-8 flex justify-center">
          <GlassButton variant="primary" icon={Trophy} href="/leaderboard">
            View the leaderboard
          </GlassButton>
        </div>
      </section>

      {/* COMMUNITY */}
      <section id="community" className="scroll-mt-24 border-t border-white/10 px-5 py-20 sm:px-8">
        <div className="glass-deep mx-auto flex max-w-4xl flex-col items-center gap-5 rounded-3xl p-8 text-center sm:p-12">
          <span className="grid h-14 w-14 place-items-center rounded-2xl border border-neon-purple/30 bg-neon-purple/10 text-neon-purple">
            <DiscordIcon className="h-7 w-7" />
          </span>
          <h2 className="text-3xl font-extrabold tracking-tight text-white sm:text-4xl">
            Join the community
          </h2>
          <p className="max-w-xl text-sm leading-relaxed text-white/60 sm:text-[15px]">
            Find matches, squad up, report bugs and shape what ships next. The Discord is where
            WindArms development happens in the open.
          </p>
          <GlassButton variant="primary" icon={DiscordIcon} href={DISCORD_URL}>
            Join our Discord
          </GlassButton>
        </div>
      </section>

      {/* NEWS */}
      <section id="news" className="scroll-mt-24 border-t border-white/10 px-5 py-20 sm:px-8">
        <SectionHeading
          eyebrow="News"
          title="Latest updates"
          subtitle="A living game. Here's what has landed recently across combat, movement, netcode and presentation."
        />
        <div className="mx-auto mt-10 max-w-3xl space-y-3">
          {NEWS.map((item) => (
            <div key={item.title} className="glass flex flex-col gap-2 rounded-2xl p-5 sm:flex-row sm:items-start sm:gap-5">
              <span className="inline-flex w-fit shrink-0 items-center rounded-full border border-neon-cyan/30 bg-neon-cyan/10 px-3 py-1 text-[10px] font-semibold uppercase tracking-widest text-neon-cyan">
                {item.tag}
              </span>
              <div>
                <h3 className="text-base font-semibold text-white">{item.title}</h3>
                <p className="mt-1 text-sm leading-relaxed text-white/55">{item.body}</p>
              </div>
            </div>
          ))}
        </div>
        <div className="mt-8 flex justify-center">
          <Link
            href="/play"
            className="rounded-xl glass px-5 py-2.5 text-sm font-semibold text-white/85 transition-colors hover:text-neon-cyan"
          >
            Jump into a match →
          </Link>
        </div>
      </section>
    </>
  );
}
