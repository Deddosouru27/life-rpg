import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import { fileURLToPath, URL } from 'node:url';

export default defineConfig({
  base: './',
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg', 'icons/*.png', 'splash/*.png'],
      manifest: {
        name: 'Life RPG — Хроника Странника',
        short_name: 'Life RPG',
        description: 'Твоя жизнь как средневековая RPG. Привычки, квесты, ранги, золото.',
        lang: 'ru',
        start_url: './',
        scope: './',
        display: 'standalone',
        orientation: 'portrait',
        /* Совпадает с --ink-950 из tokens.css: иначе рамка окна на iOS
           отличается от фона приложения на пару тонов и это заметно. */
        background_color: '#0b0a08',
        theme_color: '#0b0a08',
        categories: ['productivity', 'lifestyle', 'games'],
        icons: [
          { src: 'icons/icon-48.png', sizes: '48x48', type: 'image/png', purpose: 'any' },
          { src: 'icons/icon-96.png', sizes: '96x96', type: 'image/png', purpose: 'any' },
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: 'icons/icon-384.png', sizes: '384x384', type: 'image/png', purpose: 'any' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
          { src: 'icons/icon-maskable-192.png', sizes: '192x192', type: 'image/png', purpose: 'maskable' },
          { src: 'icons/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,woff2}'],
        navigateFallback: 'index.html',
        cleanupOutdatedCaches: true,
        /*
          runtimeCaching не нужен: приложение не обращается ни к одному
          внешнему хосту. Здесь стояло правило для Google Fonts — мёртвая
          конфигурация, оставшаяся с тех пор, когда шрифты грузились с CDN.
          Всё, что нужно офлайну, попадает в precache через globPatterns.
        */
      },
    }),
  ],
});
