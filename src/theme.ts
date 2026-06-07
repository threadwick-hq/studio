import type { ThemeConfig } from 'antd';

// A shadcn-like theme for Ant Design v5: neutral surfaces, soft 8px radii,
// subtle borders and shadows, Inter type — with a warm terracotta primary that
// keeps the studio's craft identity.
export const theme: ThemeConfig = {
  cssVar: true,
  token: {
    colorPrimary: '#c2603f',
    colorInfo: '#c2603f',
    colorLink: '#a64e30',
    borderRadius: 8,
    borderRadiusSM: 6,
    borderRadiusLG: 10,
    controlHeight: 36,
    fontSize: 14,
    fontFamily: 'Inter, system-ui, -apple-system, "Segoe UI", Roboto, Arial, sans-serif',
    colorText: '#21201c',
    colorTextSecondary: '#6b675f',
    colorTextTertiary: '#8a8275',
    colorBgLayout: '#f6f4ef',
    colorBgContainer: '#ffffff',
    colorBorder: '#e7e2d8',
    colorBorderSecondary: '#efe9dd',
    boxShadow: '0 1px 2px rgba(40,30,20,.06), 0 6px 20px rgba(40,30,20,.06)',
    boxShadowSecondary: '0 1px 2px rgba(40,30,20,.08)',
    wireframe: false,
  },
  components: {
    Button: { primaryShadow: 'none', defaultShadow: 'none', fontWeight: 500 },
    Card: { paddingLG: 0 },
    Segmented: { itemSelectedBg: '#ffffff' },
    Modal: { borderRadiusLG: 12 },
    Tooltip: { colorBgSpotlight: '#21201c' },
  },
};
