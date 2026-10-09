import { createTheme } from '@vanilla-extract/css';
import { color } from 'folds';

const silverThemeData = {
  Background: {
    Container: '#DEDEDE',
    ContainerHover: '#D3D3D3',
    ContainerActive: '#C7C7C7',
    ContainerLine: '#BBBBBB',
    OnContainer: '#000000',
  },

  Surface: {
    Container: '#EAEAEA',
    ContainerHover: '#DEDEDE',
    ContainerActive: '#D3D3D3',
    ContainerLine: '#C7C7C7',
    OnContainer: '#000000',
  },

  SurfaceVariant: {
    Container: '#DEDEDE',
    ContainerHover: '#D3D3D3',
    ContainerActive: '#C7C7C7',
    ContainerLine: '#BBBBBB',
    OnContainer: '#000000',
  },

  Primary: {
    Main: '#1245A8',
    MainHover: '#103E97',
    MainActive: '#0F3B8F',
    MainLine: '#0E3786',
    OnMain: '#FFFFFF',
    Container: '#C4D0E9',
    ContainerHover: '#B8C7E5',
    ContainerActive: '#ACBEE1',
    ContainerLine: '#A0B5DC',
    OnContainer: '#0D3076',
  },

  Secondary: {
    Main: '#000000',
    MainHover: '#171717',
    MainActive: '#232323',
    MainLine: '#2F2F2F',
    OnMain: '#EAEAEA',
    Container: '#C7C7C7',
    ContainerHover: '#BBBBBB',
    ContainerActive: '#AFAFAF',
    ContainerLine: '#A4A4A4',
    OnContainer: '#0C0C0C',
  },

  Success: {
    Main: '#017343',
    MainHover: '#01683C',
    MainActive: '#016239',
    MainLine: '#015C36',
    OnMain: '#FFFFFF',
    Container: '#BFDCD0',
    ContainerHover: '#B3D5C7',
    ContainerActive: '#A6CEBD',
    ContainerLine: '#99C7B4',
    OnContainer: '#01512F',
  },

  Warning: {
    Main: '#864300',
    MainHover: '#793C00',
    MainActive: '#723900',
    MainLine: '#6B3600',
    OnMain: '#FFFFFF',
    Container: '#E1D0BF',
    ContainerHover: '#DBC7B2',
    ContainerActive: '#D5BDA6',
    ContainerLine: '#CFB499',
    OnContainer: '#5E2F00',
  },

  Critical: {
    Main: '#9D0F0F',
    MainHover: '#8D0E0E',
    MainActive: '#850D0D',
    MainLine: '#7E0C0C',
    OnMain: '#FFFFFF',
    Container: '#E7C3C3',
    ContainerHover: '#E2B7B7',
    ContainerActive: '#DDABAB',
    ContainerLine: '#D89F9F',
    OnContainer: '#6E0B0B',
  },

  Other: {
    FocusRing: 'rgba(0 0 0 / 50%)',
    Shadow: 'rgba(0 0 0 / 20%)',
    Overlay: 'rgba(0 0 0 / 50%)',
  },
};

export const silverTheme = createTheme(color, silverThemeData);

const darkThemeData = {
  Background: {
    Container: '#1A1A1A',
    ContainerHover: '#262626',
    ContainerActive: '#333333',
    ContainerLine: '#404040',
    OnContainer: '#F2F2F2',
  },

  Surface: {
    Container: '#262626',
    ContainerHover: '#333333',
    ContainerActive: '#404040',
    ContainerLine: '#4D4D4D',
    OnContainer: '#F2F2F2',
  },

  SurfaceVariant: {
    Container: '#333333',
    ContainerHover: '#404040',
    ContainerActive: '#4D4D4D',
    ContainerLine: '#595959',
    OnContainer: '#F2F2F2',
  },

  Primary: {
    Main: '#BDB6EC',
    MainHover: '#B2AAE9',
    MainActive: '#ADA3E8',
    MainLine: '#A79DE6',
    OnMain: '#2C2843',
    Container: '#413C65',
    ContainerHover: '#494370',
    ContainerActive: '#50497B',
    ContainerLine: '#575086',
    OnContainer: '#E3E1F7',
  },

  Secondary: {
    Main: '#FFFFFF',
    MainHover: '#E5E5E5',
    MainActive: '#D9D9D9',
    MainLine: '#CCCCCC',
    OnMain: '#1A1A1A',
    Container: '#404040',
    ContainerHover: '#4D4D4D',
    ContainerActive: '#595959',
    ContainerLine: '#666666',
    OnContainer: '#F2F2F2',
  },

  Success: {
    Main: '#85E0BA',
    MainHover: '#70DBAF',
    MainActive: '#66D9A9',
    MainLine: '#5CD6A3',
    OnMain: '#0F3D2A',
    Container: '#175C3F',
    ContainerHover: '#1A6646',
    ContainerActive: '#1C704D',
    ContainerLine: '#1F7A54',
    OnContainer: '#CCF2E2',
  },

  Warning: {
    Main: '#E3BA91',
    MainHover: '#DFAF7E',
    MainActive: '#DDA975',
    MainLine: '#DAA36C',
    OnMain: '#3F2A15',
    Container: '#5E3F20',
    ContainerHover: '#694624',
    ContainerActive: '#734D27',
    ContainerLine: '#7D542B',
    OnContainer: '#F3E2D1',
  },

  Critical: {
    Main: '#E69D9D',
    MainHover: '#E28D8D',
    MainActive: '#E08585',
    MainLine: '#DE7D7D',
    OnMain: '#401C1C',
    Container: '#602929',
    ContainerHover: '#6B2E2E',
    ContainerActive: '#763333',
    ContainerLine: '#803737',
    OnContainer: '#F5D6D6',
  },

  Other: {
    FocusRing: 'rgba(255, 255, 255, 0.5)',
    Shadow: 'rgba(0, 0, 0, 1)',
    Overlay: 'rgba(0, 0, 0, 0.8)',
  },
};

export const darkTheme = createTheme(color, darkThemeData);

export const butterTheme = createTheme(color, {
  ...darkThemeData,
  Background: {
    Container: '#1A1916',
    ContainerHover: '#262621',
    ContainerActive: '#33322C',
    ContainerLine: '#403F38',
    OnContainer: '#FFFBDE',
  },

  Surface: {
    Container: '#262621',
    ContainerHover: '#33322C',
    ContainerActive: '#403F38',
    ContainerLine: '#4D4B43',
    OnContainer: '#FFFBDE',
  },

  SurfaceVariant: {
    Container: '#33322C',
    ContainerHover: '#403F38',
    ContainerActive: '#4D4B43',
    ContainerLine: '#59584E',
    OnContainer: '#FFFBDE',
  },

  Secondary: {
    Main: '#FFFBDE',
    MainHover: '#E5E2C8',
    MainActive: '#D9D5BD',
    MainLine: '#CCC9B2',
    OnMain: '#1A1916',
    Container: '#403F38',
    ContainerHover: '#4D4B43',
    ContainerActive: '#59584E',
    ContainerLine: '#666459',
    OnContainer: '#F2EED3',
  },
});

/**
 * The Mouseion dark palette, used when the client is framed inside the
 * household hub (which is dark). The page background is `#0c1016` with
 * `#05080c` as the deeper, recessed tone, and the accent is Iris's own
 * amethyst, as in the Iris dark theme (it was a sage green until
 * 2026-10-09). Everything else stays neutral (inherited from
 * `darkThemeData`) so chat content sits comfortably in it.
 */
export const mouseionTheme = createTheme(color, {
  ...darkThemeData,
  Background: {
    Container: '#0c1016',
    ContainerHover: '#111722',
    ContainerActive: '#141b28',
    ContainerLine: '#1e2836',
    OnContainer: '#e6edf3',
  },

  Surface: {
    Container: '#05080c',
    ContainerHover: '#0c1016',
    ContainerActive: '#111722',
    ContainerLine: '#1a2432',
    OnContainer: '#e6edf3',
  },

  SurfaceVariant: {
    Container: '#10161f',
    ContainerHover: '#141b26',
    ContainerActive: '#182029',
    ContainerLine: '#212c3a',
    OnContainer: '#dbe3ec',
  },

  Primary: {
    Main: '#C7A3F0',
    MainHover: '#BC95EC',
    MainActive: '#B08CE6',
    MainLine: '#A57DE0',
    OnMain: '#251A38',
    Container: '#3B2A5C',
    ContainerHover: '#443169',
    ContainerActive: '#4D3876',
    ContainerLine: '#573F84',
    OnContainer: '#E7D8FA',
  },
});

/**
 * Iris's own two themes: the house grounds, Night and Chalk (mouseion/design `tokens.json`), with
 * the flower's colors as the accent (`design/tokens.json`). Primary is the petals' amethyst and
 * Success is `iris-leaf`: on Night that is the green Cinny's dark theme already has, so it is
 * inherited, and on Chalk it is a green picked for Iris. Warning and critical stay as Cinny has
 * them. On Chalk the accent is `iris-fall`, the darkest petal, so white text on it passes 4.5:1.
 */
export const irisDarkTheme = createTheme(color, {
  ...darkThemeData,
  Background: {
    Container: '#15161A',
    ContainerHover: '#1B1C21',
    ContainerActive: '#212329',
    ContainerLine: '#32353C',
    OnContainer: '#F4F4F1',
  },

  Surface: {
    Container: '#1F2126',
    ContainerHover: '#26282E',
    ContainerActive: '#2D3037',
    ContainerLine: '#3A3D45',
    OnContainer: '#F4F4F1',
  },

  SurfaceVariant: {
    Container: '#282A31',
    ContainerHover: '#2F3239',
    ContainerActive: '#373A42',
    ContainerLine: '#41444D',
    OnContainer: '#F4F4F1',
  },

  Primary: {
    Main: '#C7A3F0',
    MainHover: '#BC95EC',
    MainActive: '#B08CE6',
    MainLine: '#A57DE0',
    OnMain: '#251A38',
    Container: '#3B2A5C',
    ContainerHover: '#443169',
    ContainerActive: '#4D3876',
    ContainerLine: '#573F84',
    OnContainer: '#E7D8FA',
  },

  Secondary: {
    Main: '#F4F4F1',
    MainHover: '#E0E0DC',
    MainActive: '#D4D4D0',
    MainLine: '#C8C8C4',
    OnMain: '#15161A',
    Container: '#32353C',
    ContainerHover: '#3A3D45',
    ContainerActive: '#42454E',
    ContainerLine: '#4B4E58',
    OnContainer: '#F4F4F1',
  },
});

export const irisLightTheme = createTheme(color, {
  ...silverThemeData,
  Background: {
    Container: '#F4F4F1',
    ContainerHover: '#EAEAE6',
    ContainerActive: '#E1E0DB',
    ContainerLine: '#D3D2CB',
    OnContainer: '#15161A',
  },

  Surface: {
    Container: '#FFFFFF',
    ContainerHover: '#F4F4F1',
    ContainerActive: '#EAEAE6',
    ContainerLine: '#DCDBD5',
    OnContainer: '#15161A',
  },

  SurfaceVariant: {
    Container: '#EDEDE9',
    ContainerHover: '#E4E4DF',
    ContainerActive: '#DBDAD5',
    ContainerLine: '#D0CFC9',
    OnContainer: '#15161A',
  },

  Primary: {
    Main: '#6E40BA',
    MainHover: '#6338A9',
    MainActive: '#5C339E',
    MainLine: '#552F93',
    OnMain: '#FFFFFF',
    Container: '#E6DAF7',
    ContainerHover: '#DCCDF3',
    ContainerActive: '#D2C0EF',
    ContainerLine: '#C8B3EB',
    OnContainer: '#432377',
  },

  Secondary: {
    Main: '#15161A',
    MainHover: '#24262B',
    MainActive: '#2E3036',
    MainLine: '#383B42',
    OnMain: '#F4F4F1',
    Container: '#DCDBD5',
    ContainerHover: '#D0CFC9',
    ContainerActive: '#C5C4BD',
    ContainerLine: '#B9B8B1',
    OnContainer: '#15161A',
  },

  Success: {
    Main: '#1F7A57',
    MainHover: '#1C6F4F',
    MainActive: '#1A684A',
    MainLine: '#186145',
    OnMain: '#FFFFFF',
    Container: '#D0E8DD',
    ContainerHover: '#C2E1D3',
    ContainerActive: '#B4DAC9',
    ContainerLine: '#A6D3BF',
    OnContainer: '#14503A',
  },
});
