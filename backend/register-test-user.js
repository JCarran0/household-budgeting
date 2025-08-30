const axios = require('axios');

async function register() {
  try {
    const response = await axios.post('http://localhost:3001/api/v1/auth/register', {
      username: 'otis',
      password: 'SuperSecure123!'
    });
    console.log('User registered:', response.data);
  } catch (error) {
    if (error.response?.data?.error?.includes('already exists')) {
      console.log('User already exists');
    } else {
      console.error('Registration failed:', error.response?.data || error.message);
    }
  }
}

register();