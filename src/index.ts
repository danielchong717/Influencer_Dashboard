import { ApolloServer } from "@apollo/server";
import { startStandaloneServer } from "@apollo/server/standalone";
import { PrismaClient, OutreachStatus } from "@prisma/client";
import { DateTimeResolver } from "graphql-scalars";

const prisma = new PrismaClient();

const typeDefs = `
    scalar DateTime

    enum Platform {
        INSTAGRAM TIKTOK YOUTUBE TWITTER
    }

    enum OutreachStatus {
        ADDED PENDING DM_SENT SEEN REPLIED NEGOTIATING
    }

    enum PaymentStatus {
        UNPAID PAID
    }

    type Influencer {
        id: ID!
        name: String!
        createdAt: DateTime!
        status: OutreachStatus!
        accounts: [SocialAccount!]!
        deals: [Deal!]!
    }

    type SocialAccount {
        id: ID!
        platform: Platform!
        handle: String!
        externalId: String
        influencerId: String
        snapshots: [MetricSnapshot!]!
        influencer: Influencer
    }

    type MetricSnapshot {
        id: ID!
        account: SocialAccount!
        accountId: String!
        followerCount: Int!
        postCount: Int
        engagementRate: Float
        views: Int
        capturedAt: DateTime!
    }

    type Deal {
        id: ID!
        influencerId: String!
        influencer: Influencer!
        amount: Float!
        currency: String!
        paymentStatus: PaymentStatus!
        notes: String
        createdAt: DateTime!
    }

    type Query {
        influencers: [Influencer!]!
        influencerById(id: ID!): Influencer
        metricHistory(accountId: String!): [MetricSnapshot!]!
        deals: [Deal!]!
    }

    type Mutation {
        createInfluencer(name: String!): Influencer!
        updateInfluencer(id: ID!, name: String, status: OutreachStatus): Influencer!
        deleteInfluencer(id: ID!): Influencer! 
    }
`;

const resolvers = {
    DateTime: DateTimeResolver,
    Query: {
        influencers: () => {
            return prisma.influencer.findMany();
        },
        influencerById: (_parent: unknown, args: { id: string }) => {
            return prisma.influencer.findUnique({ where: { id: args.id } });
        },
        metricHistory: (_parent: unknown, args: { accountId: string }) => {
            return prisma.metricSnapshot.findMany({ where: { accountId: args.accountId } });
        },
        deals: () => {
            return prisma.deal.findMany();
        },
    },
    Mutation: {
        createInfluencer: (_parent: unknown, args: { name: string }) => {
            return prisma.influencer.create({ data: { name: args.name } });
        },
        // read is above
        updateInfluencer: (_parent: unknown, args: { id: string, name?: string; status?: OutreachStatus })=> {
            return prisma.influencer.update({
                where: { id: args.id },
                data: {
                    ...(args.name !== undefined && { name: args.name }),
                    ...(args.status !== undefined && { status: args.status }),
                },
            });
        },
        deleteInfluencer: (_parent: unknown, args: { id: string }) => {
            return prisma.influencer.delete({ where: { id: args.id }});
        }
    },
    Influencer: {
        accounts: (parent: { id: string }) => {
            return prisma.socialAccount.findMany({ where: { influencerId: parent.id } });
        },
        deals: (parent: { id: string }) => {
            return prisma.deal.findMany({ where: { influencerId: parent.id } });
        },
    },
    SocialAccount: {
        influencer: (parent: { influencerId: string | null }) => {
            if (!parent.influencerId) return null;
            return prisma.influencer.findUnique({ where: { id: parent.influencerId } });
        },
        snapshots: (parent: { id: string }) => {
            return prisma.metricSnapshot.findMany({ where: { accountId: parent.id } });
        },
    },
    MetricSnapshot: {
        account: (parent: { accountId: string }) => {
            return prisma.socialAccount.findUnique({ where: { id: parent.accountId } });
        },
    },
    Deal: {
        influencer: (parent: { influencerId: string }) => {
            return prisma.influencer.findUnique({ where: { id: parent.influencerId } });
        },
    },
};

const server = new ApolloServer({ typeDefs, resolvers });

const { url } = await startStandaloneServer(server, {
    listen: { port: 4000 },
});

console.log(`Server ready at ${url}`);
