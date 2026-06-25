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
