describe('Test Setup', () => {
  it('should have test environment configured', () => {
    expect(process.env.NODE_ENV).toBe('test');
  });

  it('should have JWT_SECRET configured for tests', () => {
    expect(process.env.JWT_SECRET).toBe('test-secret-key-for-testing');
  });

  it('should be able to run a basic test', () => {
    const sum = (a: number, b: number) => a + b;
    expect(sum(1, 2)).toBe(3);
  });

  it('should have console methods mocked', () => {
    expect(console.log).toHaveBeenCalledTimes(0);
    console.log('test message');
    expect(console.log).toHaveBeenCalledTimes(1);
  });
});