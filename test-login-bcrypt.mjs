import bcrypt from 'bcryptjs';

const hash = '$2a$12$/VVnc.BGBbaxxvTiyp/mqecEU/2.sLYVZmolJUfVUWj8LzBHLCH3e';
const password = 'admin123';

const isValid = await bcrypt.compare(password, hash);

console.log('Password:', password);
console.log('Hash:', hash);
console.log('Valid:', isValid);
