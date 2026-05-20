const GITHUB_CONFIG = {
  owner: 'airtrustoffshore-stack',
  repo: 'airtrust-storage',
  token: process.env.GITHUB_TOKEN || '',
  branch: 'main',
  apiUrl: 'https://api.github.com'
};

export default GITHUB_CONFIG;
