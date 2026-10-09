// The Iris look on real components, on both grounds at once: the lockup at the sizes the app uses
// it, the pages that show it, and the accent and success colors on the controls that carry them.
// Open /mock-brand.html on the vite dev server. Not part of the app build.
import React, { ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import '@fontsource/inter/variable.css';
import 'folds/dist/style.css';
import '../index.css';
import {
  Badge,
  Box,
  Button,
  Chip,
  Text,
  color,
  config,
  configClass,
  toRem,
  varsClass,
} from 'folds';
import { onDarkFontWeight, onLightFontWeight } from '../config.css';
import { irisDarkTheme, irisLightTheme, mouseionTheme } from '../colors.css';
import { IrisLockup } from '../app/components/iris-lockup';
import { SplashScreen } from '../app/components/splash-screen';
import { UnreadBadge } from '../app/components/unread-badge';
import { WelcomePage } from '../app/pages/client/WelcomePage';
import { ScreenSize, ScreenSizeProvider } from '../app/hooks/useScreenSize';

const GROUNDS = [
  { name: 'Iris light', classes: ['iris-light-theme', irisLightTheme, onLightFontWeight] },
  { name: 'Iris dark', classes: ['iris-dark-theme', irisDarkTheme, onDarkFontWeight] },
  { name: 'Inside the Hub', classes: ['mouseion-theme', mouseionTheme, onDarkFontWeight] },
];

function Label({ children }: { children: ReactNode }) {
  return (
    <Text size="L400" priority="300">
      {children}
    </Text>
  );
}

function Ground({ name, classes }: { name: string; classes: string[] }) {
  return (
    <Box
      className={classes.join(' ')}
      direction="Column"
      gap="500"
      style={{
        flex: '1 1 0',
        minWidth: toRem(380),
        padding: config.space.S500,
        backgroundColor: color.Background.Container,
        color: color.Background.OnContainer,
      }}
    >
      <Text size="H4">{name}</Text>

      <Box direction="Column" gap="200">
        <Label>The mark beside the name</Label>
        <Box gap="600" alignItems="Center" wrap="Wrap">
          <IrisLockup size={40} />
          <IrisLockup size={24} />
          <IrisLockup size={20} />
        </Box>
      </Box>

      <Box direction="Column" gap="200">
        <Label>Accent and success on real controls</Label>
        <Box gap="300" wrap="Wrap" alignItems="Center">
          <Button size="300" variant="Primary" fill="Solid" radii="300">
            <Text size="B300">Login</Text>
          </Button>
          <UnreadBadge highlight count={2} />
          <Button size="300" variant="Success" fill="Solid" radii="300">
            <Text size="B300">Save</Text>
          </Button>
          <Button size="300" variant="Success" fill="Soft" radii="300">
            <Text size="B300">Join</Text>
          </Button>
          <Badge as="span" size="500" variant="Success" fill="Solid" radii="300">
            <Text size="L400">New Messages</Text>
          </Badge>
          <Chip variant="Success" radii="Pill" outlined>
            <Text size="B300">This Room</Text>
          </Chip>
        </Box>
      </Box>

      <Box direction="Column" gap="200">
        <Label>Welcome page (no conversation open)</Label>
        <Box
          style={{
            height: toRem(340),
            border: `1px solid ${color.Background.ContainerLine}`,
            borderRadius: config.radii.R400,
            overflow: 'hidden',
          }}
        >
          <WelcomePage />
        </Box>
      </Box>

      <Box direction="Column" gap="200">
        <Label>Splash (while the app loads)</Label>
        <Box
          direction="Column"
          style={{
            height: toRem(220),
            border: `1px solid ${color.Background.ContainerLine}`,
            borderRadius: config.radii.R400,
            overflow: 'hidden',
          }}
        >
          <SplashScreen>
            <Box grow="Yes" alignItems="Center" justifyContent="Center">
              <Text>Heating up</Text>
            </Box>
          </SplashScreen>
        </Box>
      </Box>
    </Box>
  );
}

document.body.classList.add(configClass, varsClass);
const style = document.createElement('style');
style.textContent = `html { overflow: auto; } #mock-root { min-height: 100%; }`;
document.head.appendChild(style);

createRoot(document.getElementById('mock-root')!).render(
  <ScreenSizeProvider value={ScreenSize.Desktop}>
    <Box wrap="Wrap" style={{ minHeight: '100%' }}>
      {GROUNDS.map((ground) => (
        <Ground key={ground.name} name={ground.name} classes={ground.classes} />
      ))}
    </Box>
  </ScreenSizeProvider>
);
