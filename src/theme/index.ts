export const colors = {
  primaryRed: '#E50914',
  carbonBlack: '#050608',
  smokeGrey: '#2A2D33',
  emberOrange: '#FF5F1F',
  ashWhite: '#F4F4F4',
};

export const spacing = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
};

export const radii = {
  xs: 8,
  sm: 12,
  md: 16,
  lg: 24,
  pill: 999,
};

export const typography = {
  heading: {
    fontFamily: 'System',
    fontWeight: '800' as const,
    letterSpacing: 1,
  },
  title: {
    fontFamily: 'System',
    fontWeight: '700' as const,
    letterSpacing: 0.5,
  },
  body: {
    fontFamily: 'System',
    fontWeight: '400' as const,
    letterSpacing: 0.25,
  },
  button: {
    fontFamily: 'System',
    fontWeight: '500' as const,
    letterSpacing: 1,
  },
  monospace: {
    fontFamily: 'Courier',
    fontWeight: '400' as const,
    letterSpacing: 0.5,
  },
};

export const shadows = {
  glow: {
    shadowColor: 'rgba(229, 9, 20, 0.35)',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 1,
    shadowRadius: 24,
    elevation: 12,
  },
};
