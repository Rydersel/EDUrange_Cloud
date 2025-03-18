import React from 'react';
import { motion } from 'framer-motion';
import Card from '../../components/Card';
import Button from '../../components/Button';

const Welcome = () => {
  const containerVariants = {
    hidden: { opacity: 0 },
    visible: {
      opacity: 1,
      transition: {
        staggerChildren: 0.3
      }
    }
  };

  const itemVariants = {
    hidden: { opacity: 0, y: 20 },
    visible: {
      opacity: 1,
      y: 0,
      transition: {
        duration: 0.5
      }
    }
  };

  const steps = [
    { title: "Connect", icon: "🔗", description: "Kubernetes setup" },
    { title: "Configure", icon: "🌐", description: "Domain & DNS" },
    { title: "Deploy", icon: "🚀", description: "Install components" },
    { title: "Verify", icon: "✨", description: "Test installation" }
  ];

  return (
    <motion.div
      className="min-h-screen p-6 flex flex-col"
      variants={containerVariants}
      initial="hidden"
      animate="visible"
    >
      <motion.div
        className="text-center mb-4"
        variants={itemVariants}
      >
        <h1 className="text-3xl font-bold text-gray-900 mb-2">
          Welcome to EDURange Cloud
        </h1>
        <p className="text-lg text-gray-600">
          Your platform for cybersecurity education
        </p>
      </motion.div>

      <motion.div
        className="grid grid-cols-2 gap-6 mb-8"
        variants={itemVariants}
      >
        <Card
          title="Quick Start"
          className="bg-gradient-to-br from-blue-50 to-indigo-50 border-none shadow-lg"
        >
          <div className="flex flex-col justify-between h-[280px]">
            <motion.p
              className="text-gray-700 leading-relaxed mb-4"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.5 }}
            >
              EDURange Cloud lets you host cybersecurity competitions and exercises on Kubernetes with ease.
            </motion.p>

            <motion.div variants={itemVariants}>
              <h3 className="text-lg font-semibold text-gray-900 mb-3">Requirements</h3>
              <div className="grid grid-cols-2 gap-2">
                {[
                  { icon: "⚡", text: "Kubernetes" },
                  { icon: "🎮", text: "kubectl" },
                  { icon: "⚙️", text: "Helm" },
                  { icon: "🌐", text: "Cloudflare" }
                ].map((item, index) => (
                  <motion.div
                    key={index}
                    className="flex items-center space-x-2 text-gray-700"
                    whileHover={{ scale: 1.05 }}
                    transition={{ type: "spring", stiffness: 300 }}
                  >
                    <span className="text-xl">{item.icon}</span>
                    <span className="text-sm">{item.text}</span>
                  </motion.div>
                ))}
              </div>
            </motion.div>
          </div>
        </Card>

        <Card
          title="Installation Steps"
          className="bg-gradient-to-br from-purple-50 to-pink-50 border-none shadow-lg"
        >
          <div className="grid gap-2 h-[280px] content-center">
            {steps.map((step, index) => (
              <motion.div
                key={index}
                className="flex items-center space-x-3 p-2 rounded-lg hover:bg-white/50 transition-colors"
                variants={itemVariants}
                whileHover={{ x: 10 }}
              >
                <span className="text-xl">{step.icon}</span>
                <div>
                  <h3 className="font-medium text-gray-900">{step.title}</h3>
                  <p className="text-xs text-gray-600">{step.description}</p>
                </div>
              </motion.div>
            ))}
          </div>
        </Card>
      </motion.div>

      <motion.div
        className="flex justify-center 4"
        variants={itemVariants}
      >
        <Button
          to="/kubectl-setup"
          size="lg"
          className="bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white px-8 py-3 rounded-full font-medium shadow-lg hover:shadow-xl transition-all duration-300 transform hover:scale-105"
        >
          Begin Installation
        </Button>
      </motion.div>
    </motion.div>
  );
};

export default Welcome;
