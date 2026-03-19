import Google from "next-auth/providers/google";
import Credentials from "next-auth/providers/credentials";
import GoogleProvider from "next-auth/providers/google";
import CredentialsProvider from "next-auth/providers/credentials";
import type { NextAuthOptions } from "next-auth";
import { pool, getOrCreateUser } from "@/lib/db";
import bcrypt from "bcryptjs";

export const authOptions: NextAuthOptions = {
  providers: [
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
      authorization: {
        params: {
          prompt: "consent",
          access_type: "offline",
          response_type: "code"
        }
      }
    }),
    CredentialsProvider({
      name: "Credentials",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) {
          return null;
        }

        const client = await pool.connect();
        try {
          const result = await client.query(
            "SELECT id, email, name, password FROM users WHERE email = $1",
            [credentials.email.toLowerCase()]
          );

          if (result.rows.length === 0) {
            return null;
          }

          const user = result.rows[0];

          // Check if user has a password (not OAuth-only user)
          if (!user.password) {
            return null;
          }

          // Verify password
          const isPasswordValid = await bcrypt.compare(
            credentials.password as string,
            user.password
          );

          if (!isPasswordValid) {
            return null;
          }

          return {
            id: user.id.toString(),
            email: user.email,
            name: user.name,
          };
        } finally {
          client.release();
        }
      },
    }),
  ],
  callbacks: {
    async signIn({ user, account }) {
      if (account?.provider === "google" && user.email) {
        const client = await pool.connect();
        try {
          const result = await client.query(
            "SELECT password FROM users WHERE email = $1",
            [user.email.toLowerCase()]
          );

          if (result.rows.length > 0 && result.rows[0].password) {
            return "/?error=EmailAccountExists";
          }
        } finally {
          client.release();
        }
      }
      return true;
    },

    async redirect({ url, baseUrl }: { url: string; baseUrl: string }) {
      // Allow returning to any URL on the same origin (including relative URLs)
      try {
        const u = new URL(url, baseUrl); // supports relative callbackUrl
        if (u.origin === baseUrl) return u.toString();
      } catch {
        // if url is relative like "/results/abc", let it pass
        if (url.startsWith("/")) return `${baseUrl}${url}`;
      }
      // Fallback: home (used only if it's a different origin)
      return baseUrl;
    },

    async jwt({ token, user, account }: any) {
      if (account && user) {
        if (account.provider === "google") {
          try {
            const dbUser = await getOrCreateUser(user.email, user.name || "Google User");
            token.id = dbUser.id.toString();
            token.email = dbUser.email;
            token.name = dbUser.name;
          } catch (error) {
            console.error("Error syncing Google user to database:", error);
            token.id = user.id;
            token.email = user.email;
            token.name = user.name;
          }
        } else if (account.provider === "credentials") {
          token.id = user.id;
          token.email = user.email;
          token.name = user.name;
        }
      }
      return token;
    },

    async session({ session, token }: any) {
      if (session.user) {
        session.user.id = token.id as string;
        session.user.email = token.email as string;
        session.user.name = token.name as string;
      }
      return session;
    },
  },
  pages: {
    signIn: "/",
  },
  session: {
    strategy: "jwt" as const,
  },
};

