// ─────────────────────────────────────────────────────────────────────────────
// Tenant Branding — Per-tenant branding configuration for social media sharing
// ─────────────────────────────────────────────────────────────────────────────
// Returns branding defaults for the AI creative engine's social media output:
//   - cloudinaryUploadPreset: Cloudinary preset for menu image uploads
//   - defaultCaption: default Instagram caption for AI-generated dish content
//   - instagramHandle: restaurant's Instagram handle
//   - instagramLocation: restaurant's location tag
//
// Values can be overridden via Vite environment variables (VITE_CLOUDINARY_UPLOAD_PRESET).
// ─────────────────────────────────────────────────────────────────────────────

const DEFAULT_BRANDING = {
  cloudinaryUploadPreset: 'softshape-menu',
  defaultCaption: "✨ Savor the perfection in every bite! Our chef's latest creation is here. 🥘❤️\n\n#SoftshapeAI #FoodArt",
  instagramHandle: 'your_restaurant',
  instagramLocation: 'India',
};

export function getTenantBranding() {
  return {
    ...DEFAULT_BRANDING,
    cloudinaryUploadPreset: import.meta.env.VITE_CLOUDINARY_UPLOAD_PRESET || DEFAULT_BRANDING.cloudinaryUploadPreset,
  };
}
