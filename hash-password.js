const bcrypt = require('bcryptjs');

const password = 'Admin@123456'; // Change this to your desired password
const hashedPassword = bcrypt.hashSync(password, 10);

console.log('Hashed Password:', hashedPassword);
