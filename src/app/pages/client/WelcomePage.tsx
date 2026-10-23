import React from 'react';
import { Box, Button, Icon, Icons, Text, config, toRem } from 'folds';
import { Page, PageHeroSection } from '../../components/page';
import { IrisLockup } from '../../components/iris-lockup';

export const MOUSEION_SOURCE_URL = 'https://forgejo.example.org/mouseion/iris';
export const CINNY_URL = 'https://cinny.in';

export function WelcomePage() {
  return (
    <Page>
      <Box
        grow="Yes"
        style={{ padding: config.space.S400, paddingBottom: config.space.S700 }}
        alignItems="Center"
        justifyContent="Center"
      >
        <PageHeroSection>
          {/* PageHero's shape, with the mark beside the name where it stacks an icon over a title. */}
          <Box direction="Column" gap="400">
            <Box as="h2" direction="Column" gap="200" alignItems="Center">
              <IrisLockup size={40} />
              <Text align="Center" priority="400">
                Pick a conversation on the left to get going
              </Text>
            </Box>
            <Box justifyContent="Center">
              <Box grow="Yes" style={{ maxWidth: toRem(300) }} direction="Column" gap="300">
                <Button
                  as="a"
                  href={MOUSEION_SOURCE_URL}
                  target="_blank"
                  rel="noreferrer noopener"
                  before={<Icon size="200" src={Icons.Code} />}
                >
                  <Text as="span" size="B400" truncate>
                    Source Code
                  </Text>
                </Button>
                <Button
                  as="a"
                  href={CINNY_URL}
                  target="_blank"
                  rel="noreferrer noopener"
                  fill="Soft"
                  before={<Icon size="200" src={Icons.Heart} />}
                >
                  <Text as="span" size="B400" truncate>
                    Built on Cinny
                  </Text>
                </Button>
              </Box>
            </Box>
          </Box>
        </PageHeroSection>
      </Box>
    </Page>
  );
}
