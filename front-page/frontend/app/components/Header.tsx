import Link from 'next/link';
import styled from 'styled-components';

const HeaderContainer = styled.header`
  background-color: #121212;
  padding: 1rem 2rem;
  display: flex;
  justify-content: space-between;
  align-items: center;
  box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
`;

const Logo = styled.h1`
  color: #00ff00;
  font-size: 1.5rem;
  cursor: pointer;
`;

const Navigation = styled.nav`
  display: flex;
  align-items: center;
  gap: 20px;
`;

const NavLink = styled.a`
  color: #00ff00;
  text-decoration: none;
  font-size: 1rem;
  cursor: pointer;
  transition: color 0.3s;

  &:hover {
    color: #ffffff;
  }
`;

const Header: React.FC = () => {
  return (
    <HeaderContainer>
      <Link href="/" passHref>
        <Logo>Edurange CTF</Logo>
      </Link>
      <Navigation>
        <Link href="/" passHref>
          <NavLink>Home</NavLink>
        </Link>
        <Link href="/login" passHref>
          <NavLink>Login</NavLink>
        </Link>
        <Link href="/contact" passHref>
          <NavLink>Github</NavLink>
        </Link>
      </Navigation>
    </HeaderContainer>
  );
};

export default Header;
