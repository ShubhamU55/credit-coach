import appJson from '../../app.json';

describe('app.json privacy settings', () => {
  const { android } = appJson.expo;

  it('keeps Android backup off so on-device data is never copied to the cloud', () => {
    expect(android.allowBackup).toBe(false);
  });

  it('keeps the three blocked permissions', () => {
    expect([...android.blockedPermissions].sort((a, b) => a.localeCompare(b))).toEqual([
      'android.permission.READ_EXTERNAL_STORAGE',
      'android.permission.SYSTEM_ALERT_WINDOW',
      'android.permission.WRITE_EXTERNAL_STORAGE',
    ]);
  });
});
