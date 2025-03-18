export const checkOAuthConfiguration = async ({
  setOauthStatus,
  markStepCompleted
}) => {
  setOauthStatus('checking');

  try {
    // Check if dashboard-secrets exists with GitHub OAuth credentials
    const secretExists = await window.api.executeCommand('kubectl', [
      'get',
      'secret',
      'dashboard-secrets',
      '--ignore-not-found'
    ]);

    if (!secretExists.stdout.includes('dashboard-secrets')) {
      setOauthStatus('not-configured');
      return false;
    }

    // Check for GitHub client ID
    const githubClientIdExists = await window.api.executeCommand('kubectl', [
      'get',
      'secret',
      'dashboard-secrets',
      '-o',
      'jsonpath={.data.github-client-id}',
      '--ignore-not-found'
    ]);

    // Check for GitHub client secret
    const githubClientSecretExists = await window.api.executeCommand('kubectl', [
      'get',
      'secret',
      'dashboard-secrets',
      '-o',
      'jsonpath={.data.github-client-secret}',
      '--ignore-not-found'
    ]);

    if (!githubClientIdExists.stdout || !githubClientSecretExists.stdout) {
      setOauthStatus('not-configured');
      return false;
    }

    // Decode the values to check if they are valid
    const clientId = atob(githubClientIdExists.stdout);
    const clientSecret = atob(githubClientSecretExists.stdout);

    if (clientId === 'placeholder' || clientSecret === 'placeholder' || !clientId || !clientSecret) {
      setOauthStatus('not-configured');
      return false;
    }

    setOauthStatus('configured');

    // Mark OAuth setup step as completed
    await window.api.executeStep('oauth-setup');
    markStepCompleted('oauth-setup');

    return true;
  } catch (error) {
    console.error('Error checking OAuth configuration:', error);
    setOauthStatus('error');
    return false;
  }
}; 