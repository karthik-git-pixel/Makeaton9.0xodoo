/** @type {import('next').NextConfig} */
const nextConfig = {
  async redirects() {
    return [
      {
        source: '/insta',
        destination: 'https://www.instagram.com/makeaton.in/',
        permanent: false,
      },
      {
        source: '/instagram',
        destination: 'https://www.instagram.com/makeaton.in/',
        permanent: false,
      },
      {
        source: '/telegram',
        destination: 'https://t.me/+iMqdZkcEeM42MTU9',
        permanent: false,
      },
      {
        source: '/tg',
        destination: 'https://t.me/+iMqdZkcEeM42MTU9',
        permanent: false,
      },
      {
        source: '/x',
        destination: 'https://x.com/MakeaTonCusat',
        permanent: false,
      },
      {
        source: '/twitter',
        destination: 'https://x.com/MakeaTonCusat',
        permanent: false,
      },
      {
        source: '/rr',
        destination: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
        permanent: false,
      },
      {
        source: '/rickroll',
        destination: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
        permanent: false,
      },
      {
        source: '/linkedin',
        destination: 'https://www.linkedin.com/company/makeaton/',
        permanent: false,
      },
      {
        source: '/discord',
        destination: 'https://discord.gg/qkw7rdVR',
        permanent: false,
      },
      {
        source: '/whatsapp',
        destination: 'https://whatsapp.com/channel/0029ValGCQM60eBjNF5wS10C',
        permanent: false,
      },
      {
        source: '/wa',
        destination: 'https://chat.whatsapp.com/CfwcVSlLj2rEQBvIkTRi4e',
        permanent: false,
      },
      {
        source: '/community',
        destination: 'https://chat.whatsapp.com/CfwcVSlLj2rEQBvIkTRi4e',
        permanent: false,
      },
    ];
  },
};

module.exports = nextConfig;
