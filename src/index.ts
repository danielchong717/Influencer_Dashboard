import { ApolloServer } from "@apollo/server";
import { startStandaloneServer } from "@apollo/server/standalone";
import { PrismaClient } from "@prisma/client"
import { DateTimeResolver } from "graphql-scalars";

const prisma = new PrismaClient();

const typeDefs = `
    scalar DateTime
    enum Platform {
        INSTAGRAM TIKTOK YOUTUBE TWITTER
    }
    type Influencer {
        id: ID!
        name: String!
        accounts: [SocialAccount!]!
    }
    type SocialAccount {
        id: ID!
        platform: Platform!
        handle: String!
        externalId: String
        influencerId: String!
        snapshots: [MetricSnapshot!]
        influencer: Influencer!
    }
    type MetricSnapshot {
        id: ID!
        account: SocialAccount!
        accountId: String!
        followerCount: Int!
        postCount: Int
        engagementRate: Float
        capturedAt: DateTime!
    }
    type Query {
        influencers: [Influencer!]!
        influencerById(id: ID!): Influencer
        metricHistory(accountId: String!): [MetricSnapshot!]!
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
    },
    Influencer: {
        accounts: (parent: { id: string }) => {
            return prisma.socialAccount.findMany({ where: { influencerId: parent.id } });
        },
    },
    SocialAccount: {
        influencer: (parent: { influencerId: string }) => {
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
};

const server = new ApolloServer({ typeDefs, resolvers });

const { url } = await startStandaloneServer(server, {
    listen: { port: 4000 },
});

console.log(`Server ready at ${url}`);


