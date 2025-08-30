const axios = require('axios');
const fs = require('fs-extra');
const path = require('path');

async function setupTestUser() {
  try {
    // First, delete the existing otis user from the data file
    const usersFile = path.join(__dirname, 'data', 'users.json');
    const data = await fs.readJson(usersFile);
    
    // Filter out the otis user
    data.users = data.users.filter(u => u.username !== 'otis');
    
    // Save the updated users
    await fs.writeJson(usersFile, data, { spaces: 2 });
    console.log('Removed existing otis user');
    
    // Now register a new otis user
    const response = await axios.post('http://localhost:3001/api/v1/auth/register', {
      username: 'otis',
      password: 'SuperSecure123!'
    });
    
    console.log('✅ User registered successfully');
    console.log('Username:', response.data.user.username);
    console.log('User ID:', response.data.user.id);
    console.log('Token received:', response.data.token ? 'Yes' : 'No');
    
    // Test login
    const loginResponse = await axios.post('http://localhost:3001/api/v1/auth/login', {
      username: 'otis',
      password: 'SuperSecure123!'
    });
    
    console.log('✅ Login test successful');
    
  } catch (error) {
    console.error('Setup failed:', error.response?.data || error.message);
  }
}

setupTestUser();