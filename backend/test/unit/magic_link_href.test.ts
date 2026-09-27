import { describe, expect, it } from 'vitest';
import { magicLinkHref } from '../../src/auth/magic-link.service';

describe('magicLinkHref', () => {
  it('pointe le CMS vers /admin/login, pas /auth/magic', () => {
    expect(
      magicLinkHref({
        token: 'abc+1',
        platform: 'cms',
        appBase: 'https://api.example',
        cmsBase: 'https://cms.example',
      }),
    ).toBe('https://cms.example/admin/login?token=abc%2B1');
  });

  it('sans MAGIC_LINK_CMS_URL, réutilise la base avec le chemin CMS', () => {
    expect(
      magicLinkHref({
        token: 'tok',
        platform: 'cms',
        appBase: 'https://cms.example/',
      }),
    ).toBe('https://cms.example/admin/login?token=tok');
  });

  it('mobile/web restent sur /auth/magic', () => {
    expect(
      magicLinkHref({
        token: 'tok',
        platform: 'ios',
        appBase: 'https://medanki.dz',
        cmsBase: 'https://cms.example',
      }),
    ).toBe('https://medanki.dz/auth/magic?token=tok');
  });
});
