import { isAccountSuspended, accountSessionValid } from "@/lib/auth/accountAccess";
import type { NextAuthOptions } from "next-auth";
import { PrismaAdapter } from "@next-auth/prisma-adapter";
import prisma from "@/lib/prisma";
import bcrypt from "bcrypt";
import CredentialsProvider from "next-auth/providers/credentials";
import GoogleProvider from "next-auth/providers/google";
import { credentialSessionValid, credentialStamp } from "@/lib/auth/sessionCredential";
import { endImpersonation, resolveImpersonationIdentity } from "@/lib/auth/impersonation";
import { refreshedGoogleImage } from "@/lib/auth/googleProfileImage";

declare module "next-auth" {
  interface Session {
    error?: "AccountRemoved" | "SessionUnavailable" | "SessionRevoked" | "AccountImpersonated" | "AccountSuspended";
    impersonation?: { userName: string; expiresAt: string };
    user: {
      id: string;
      name: string | null;
      email: string | null;
      image: string | null | undefined;
      emailVerified : boolean | null;
      provider: string | null;
      role : string | null;
  };
}

  interface JWT {
    id: string;
    name?: string | null;
    email?: string | null;
    picture?: string | null;
    role : string | null;
  }
}

export const authOptions: NextAuthOptions = {
  adapter: PrismaAdapter(prisma),
  // Ensure a strong secret is provided via env; this is required for JWT/session integrity
  secret: process.env.NEXTAUTH_SECRET,
  providers: [
    CredentialsProvider({
      name: "Credentials",
      credentials: {
        email: { label: "Email", type: "text", placeholder: "email@example.com" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials.password) {
          throw new Error("Email e senha são obrigatórios");
        }

        const user = await prisma.user.findUnique({
          where: { email: credentials.email },
        });

        if (!user || !user.password || !user.emailVerified) return null;

        const isPasswordValid = await bcrypt.compare(
          credentials.password,
          user.password || ""
        );

        if (!isPasswordValid) return null;
        if (isAccountSuspended(user)) throw new Error("AccountSuspended");

        return user
      },
    }),
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID as string,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET as string,
      httpOptions: {
        timeout: 15000,
      },
    }),
  ],
  session: {
    strategy: "jwt",

  },
  callbacks: {
    async signIn({ user, account, profile }) {

      if(account?.provider === "credentials") return true

      if (!user?.email || !account) {
        throw new Error("Dados de usuário ou conta estão ausentes.");
      }

      const existingUser = await prisma.user.findUnique({
        where: { email: user.email },
        include: { accounts: true },
      });

      if (existingUser) {
        if (isAccountSuspended(existingUser)) return false;
        const isSameProvider = existingUser.accounts.some(
          (acc) => acc.provider === account.provider
        );

        if (!isSameProvider) {
          throw new Error(
            encodeURIComponent( `Esse e-mail ja está vinculado ao um outro proverdor de autenticação.`)

          );
        }
        if (account.provider === "google") {
          const picture = profile && "picture" in profile ? profile.picture : user.image;
          const image = refreshedGoogleImage(existingUser.image, picture);
          if (image) {
            // Do not replace a custom upload saved while the OAuth flow was pending.
            await prisma.user.updateMany({ where: { id: existingUser.id, image: existingUser.image }, data: { image } });
          }
        }
      } else {
        await prisma.user.create({
          data: {
            email: user.email,
            name: user.name,
            image: user.image,
            accounts: {
              create: {
                provider: account.provider,
                providerAccountId: account.providerAccountId,
                type: account.type,
              },
            },
          },
        });
      }

      return true;
    },

    async jwt({ token, user, account }) {
      // Se for um novo login ou atualização de credenciais, adiciona os dados do usuário
      if (user) {
        token.id = user.id;
        token.email = user.email;
        token.name = user.name;
        token.image = user.image;
        token.provider = account?.provider;
        if (account?.provider === "credentials") {
          token.credentialStamp = credentialStamp("password" in user && typeof user.password === "string" ? user.password : null);
        }
        if ("emailVerified" in user) {
          token.emailVerified = user.emailVerified;
        }
        if ("role" in user) {
          token.role = user.role;
        }
      }

      // Every session read must verify that the JWT still belongs to a live account.
      if (typeof token.id === "string" && token.id && token.provider !== "dev-admin") {
        try {
          const updatedUser = await prisma.user.findUnique({
            where: { id: token.id },
            select: { id: true, name: true, email: true, image: true, emailVerified: true, role: true, password: true, suspendedAt: true, suspendedUntil: true, sessionVersion: true },
          });

          if (user && updatedUser) token.sessionVersion = updatedUser.sessionVersion;
          if (updatedUser && isAccountSuspended(updatedUser)) {
            await endImpersonation(prisma, token);
            token = { error: "AccountSuspended" };
          } else if (updatedUser && !accountSessionValid(token.sessionVersion, updatedUser.sessionVersion)) {
            await endImpersonation(prisma, token);
            token = { error: "SessionRevoked" };
          } else if (updatedUser && !credentialSessionValid(token.provider, token.credentialStamp, updatedUser.password)) {
            await endImpersonation(prisma, token);
            token = { error: "SessionRevoked" };
          } else if (updatedUser) {
            token.name = updatedUser.name;
            token.email = updatedUser.email;
            token.image = updatedUser.image;
            token.emailVerified = updatedUser.emailVerified;
            token.role = updatedUser.role;
            delete token.error;
          } else {
            await endImpersonation(prisma, token);
            token = { error: "AccountRemoved" };
          }
        } catch {
          // Fail closed without exposing database details or treating an outage as a ban.
          token = { error: "SessionUnavailable" };
        }
      }

      // Retire tokens created by the removed development provider.
      if (token.provider === "dev-admin") {
        token.id = "";
        token.role = null;
      }

      if (typeof token.id === "string" && token.id && !token.error) {
        try {
          const identity = await resolveImpersonationIdentity(prisma, token);
          token.effectiveUserId = identity.user?.id ?? "";
          token.effectiveRole = identity.user?.role ?? null;
          token.accountBlocked = identity.blocked;
          if (identity.impersonation) {
            token.impersonationView = identity.impersonation;
            token.effectiveName = identity.user?.name;
            token.effectiveEmail = identity.user?.email;
            token.effectiveImage = identity.user?.image;
            token.effectiveEmailVerified = identity.user?.emailVerified;
          } else {
            delete token.impersonationId;
            delete token.impersonationView;
          }
        } catch { token.effectiveUserId = ""; token.accountBlocked = true; token.error = "SessionUnavailable"; }
      }

      // console.log("JWT Token Atualizado:", token);
      return token;
    },

    async session({ session, token }) {
      session.error = token.error === "AccountRemoved" || token.error === "SessionUnavailable" || token.error === "SessionRevoked" || token.error === "AccountSuspended" ? token.error : undefined;
      session.user = {
        id: typeof token.id === "string" ? token.id : "",
        name: token.name || null,
        email: token.email || null,
        provider : typeof token.provider === 'string' ? token.provider : null,
        image: typeof token.image === "string" ? token.image : null,
        emailVerified: typeof token.emailVerified === 'boolean' ? token.emailVerified : null,
        role : typeof token.role === 'string' ? token.role : null
      };
      if (token.accountBlocked === true) { session.user.id = ""; session.user.role = null; if (!session.error) session.error = "AccountImpersonated"; }
      if (typeof token.effectiveUserId === "string" && token.effectiveUserId && token.impersonationId) {
        session.user.id = token.effectiveUserId;
        session.user.role = typeof token.effectiveRole === "string" ? token.effectiveRole : null;
        session.user.name = typeof token.effectiveName === "string" ? token.effectiveName : null;
        session.user.email = typeof token.effectiveEmail === "string" ? token.effectiveEmail : null;
        session.user.image = typeof token.effectiveImage === "string" ? token.effectiveImage : null;
        session.user.emailVerified = typeof token.effectiveEmailVerified === "boolean" ? token.effectiveEmailVerified : null;
        const view = token.impersonationView as { userName: string; expiresAt: string } | undefined;
        if (view) session.impersonation = { userName: view.userName, expiresAt: view.expiresAt };
      }
      return session;
    },
  },
  events: { async signOut({ token }) { if (token) await endImpersonation(prisma, token); } },
  jwt : {
    // Use the correct env var and avoid typos that break signing
    secret: process.env.NEXTAUTH_SECRET,
    maxAge : 60 * 3,
  },
  pages: {
    signIn: "/login", // Página de login personalizada
    error: "/login", // Redireciona para login em caso de erro
  },
};
