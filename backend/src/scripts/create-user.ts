import { createUser, findUserByEmail, type Role } from "../auth.js";

const [email, name, password, role = "editor"] = process.argv.slice(2);
if (!email || !name || !password) {
  console.error("Usage: npm run create-user -- <email> <name> <password> [admin|editor|viewer]");
  process.exit(1);
}
if (password.length < 8) {
  console.error("Password must be at least 8 characters");
  process.exit(1);
}
if (findUserByEmail(email)) {
  console.error(`User ${email} already exists`);
  process.exit(1);
}
const u = createUser({ email, name, password, role: role as Role });
console.log(`Created ${u.role} ${u.email} (${u.id})`);
