---
trigger: always_on
description: Modern web design & UI creation guidelines using the Claude Design Skillstack
---

# UI & Web Design Excellence Rule

Whenever creating, designing, updating, or refactoring user interfaces, HTML pages, CSS styles, animations, 3D elements, or client-side components:

## 1. Aesthetic Excellence (Never Create Plain/MVP Designs)
- **Consult `modern-web-design`**: Use modern design principles (2024-2025): fluid clamp typography (`clamp(1rem, 2vw, 2.5rem)`), harmonious modern color palettes, clean negative space, and dark-mode compatible palettes.
- **Visual Depth & Polish**: Use subtle glassmorphism (`backdrop-filter: blur()`), modern shadows, border gradients, and clean card containers instead of default unstyled boxes.
- **Dynamic & Interactive**: The interface must feel responsive and alive through hover feedback, interactive micro-animations, and fluid transitions.

## 2. Animation & Interaction Stack
Select the best animation library for the task based on the installed design skills:
- **GSAP & ScrollTrigger** (`gsap-scrolltrigger`): For complex multi-step timelines, scroll-driven narratives, pinning, and parallax.
- **Anime.js / Lottie** (`animejs`, `lottie-animations`): For lightweight SVG morphing, vector animations, and UI micro-interactions.
- **Framer Motion / Motion** (`motion-framer`): For React UI components, exit/enter animations, and layout transitions.
- **Lightweight 3D** (`lightweight-3d-effects`): For subtle background depth (Vanta.js), 3D card tilt (Vanilla Tilt), or lightweight pseudo-3D (Zdog).
- **Three.js & R3F** (`threejs-webgl`, `react-three-fiber`): For rich, interactive 3D WebGL scenes, product configurators, or canvas visualizers.

## 3. Performance & Accessibility
- **Performance First**: Animate only GPU-accelerated properties (`transform`, `opacity`). Never trigger layout thrashing. Maintain smooth 60fps.
- **Accessibility**: Support `prefers-reduced-motion: reduce`, keyboard navigability, semantic tags, and WCAG AA contrast.
