import { getCompanyName } from './company-name';

describe('getCompanyName', () => {
  it('maps SHANKARA_HYD to Shankara Buildpro', () => {
    expect(getCompanyName('SHANKARA_HYD')).toBe('Shankara Buildpro');
  });

  it('passes through other company ids', () => {
    expect(getCompanyName('OTHER_CO')).toBe('OTHER_CO');
  });
});
