const axios = require('axios');

async function testLogin() {
  try {
    console.log('Testing login with username: otis');
    const response = await axios.post('http://localhost:3001/api/v1/auth/login', {
      username: 'otis',
      password: 'SuperSecure123!'
    });
    console.log('Login successful!');
    console.log('Token:', response.data.token);
    console.log('User:', response.data.user);
  } catch (error) {
    console.error('Login failed:', error.response?.data || error.message);
    
    // Try with a different password
    console.log('\nTrying with password: Password123!');
    try {
      const response2 = await axios.post('http://localhost:3001/api/v1/auth/login', {
        username: 'otis',
        password: 'Password123!'
      });
      console.log('Login successful with Password123!');
      console.log('Token:', response2.data.token);
    } catch (error2) {
      console.error('Also failed:', error2.response?.data || error2.message);
    }
  }
}

testLogin();